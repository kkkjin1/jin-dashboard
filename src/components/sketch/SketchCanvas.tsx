'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, MarkerType, BaseEdge, getStraightPath, useInternalNode,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type NodeProps, type NodeTypes, type OnNodeDrag, type Edge, type EdgeTypes, type EdgeProps, type OnConnect,
  type InternalNode, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import { ArrowLeft, Plus, Trash2, GripVertical } from 'lucide-react'
import type { SketchBoard, SketchCard, SketchEdge } from '@/types'

const COLOR_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[]
const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 140
const CONNECT_OVERLAP_RATIO = 0.6
const DISCONNECT_OVERLAP_RATIO = 0.55
const EDGE_COLOR = 'rgba(157,190,245,0.55)'
const EDGE_STYLE = { stroke: EDGE_COLOR, strokeWidth: 1.5 }
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 }

function edgeFromRow(row: SketchEdge): Edge {
  return { id: row.id, source: row.source_card_id, target: row.target_card_id, type: 'floating', markerEnd: EDGE_MARKER, style: EDGE_STYLE }
}

// 카드 위치가 바뀌어도 항상 두 카드 경계를 잇는 직선으로 다시 그려지는 edge
function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode) {
  const w = (intersectionNode.measured.width ?? DEFAULT_WIDTH) / 2
  const h = (intersectionNode.measured.height ?? DEFAULT_HEIGHT) / 2
  const pos = intersectionNode.internals.positionAbsolute
  const targetPos = targetNode.internals.positionAbsolute
  const targetW = (targetNode.measured.width ?? DEFAULT_WIDTH) / 2
  const targetH = (targetNode.measured.height ?? DEFAULT_HEIGHT) / 2

  const x2 = pos.x + w
  const y2 = pos.y + h
  const x1 = targetPos.x + targetW
  const y1 = targetPos.y + targetH

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1)
  const xx3 = a * xx1
  const yy3 = a * yy1
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 }
}

function FloatingEdge({ id, source, target, markerEnd, style }: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode) return null
  const s = getNodeIntersection(sourceNode, targetNode)
  const t = getNodeIntersection(targetNode, sourceNode)
  const [path] = getStraightPath({ sourceX: s.x, sourceY: s.y, targetX: t.x, targetY: t.y })
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
}

const edgeTypes: EdgeTypes = { floating: FloatingEdge }

type CardData = {
  content: string
  color: CategoryColorKey
  onContentChange: (id: string, content: string) => void
  onColorChange: (id: string, color: CategoryColorKey) => void
  onDelete: (id: string) => void
}
type CardNode = Node<CardData, 'sticky'>

function StickyCardNode({ id, data }: NodeProps<CardNode>) {
  const [text, setText] = useState(data.content)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const palette = CATEGORY_PALETTE[data.color]

  function handleChange(value: string) {
    setText(value)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => data.onContentChange(id, value), 500)
  }

  return (
    <div
      className="group relative h-full w-full flex flex-col rounded-xl overflow-hidden shadow-lg"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      <Handle type="target" position={Position.Left}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ width: 10, height: 10, background: palette.solid, border: '2px solid rgba(255,255,255,0.7)' }} />
      <Handle type="source" position={Position.Right}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ width: 10, height: 10, background: palette.solid, border: '2px solid rgba(255,255,255,0.7)' }} />

      <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {COLOR_KEYS.map(key => (
          <button
            key={key}
            className="nodrag nopan w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform hover:scale-125"
            style={{ background: CATEGORY_PALETTE[key].solid, outline: key === data.color ? `1.5px solid ${CATEGORY_PALETTE[key].text}` : 'none', outlineOffset: 1.5 }}
            onClick={() => data.onColorChange(id, key)}
          />
        ))}
        <button
          className="nodrag nopan ml-auto opacity-50 hover:opacity-100 hover:text-red-400 transition-all flex-shrink-0"
          onClick={() => data.onDelete(id)}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative px-2 pb-2">
        <textarea
          className="nodrag nopan absolute inset-0 w-full h-full bg-transparent resize-none focus:outline-none text-[12.5px] leading-snug placeholder:opacity-40"
          style={{ color: '#E2E8F0', padding: '0 2px' }}
          value={text}
          onChange={e => handleChange(e.target.value)}
          placeholder=""
        />
        <div className="absolute inset-y-0 left-0 w-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing">
          <GripVertical size={14} className="opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none" style={{ color: palette.solid }} />
        </div>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = { sticky: StickyCardNode }

function cardToNode(card: SketchCard, handlers: Omit<CardData, 'content' | 'color'>): CardNode {
  return {
    id: card.id,
    type: 'sticky',
    position: { x: card.position_x, y: card.position_y },
    style: { width: card.width, height: card.height },
    data: { content: card.content, color: card.color as CategoryColorKey, ...handlers },
  }
}

function rectsOverlapArea(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  const w = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx))
  const h = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by))
  return w * h
}

// 순수 함수 — state/ref 접근 없음, 부작용 없음
// disconnect 패스를 먼저 실행해야 연결된 카드끼리의 겹침이 connect로 오판되지 않음
function detectOverlap(
  draggedId: string,
  pos: { x: number; y: number },
  allNodes: CardNode[],
  currentEdges: Edge[],
): { id: string; disconnect: boolean } | null {
  const area = DEFAULT_WIDTH * DEFAULT_HEIGHT
  for (const n of allNodes) {
    if (n.id === draggedId) continue
    const connected = currentEdges.some(e =>
      (e.source === draggedId && e.target === n.id) || (e.source === n.id && e.target === draggedId))
    if (!connected) continue
    const overlap = rectsOverlapArea(pos.x, pos.y, DEFAULT_WIDTH, DEFAULT_HEIGHT, n.position.x, n.position.y, DEFAULT_WIDTH, DEFAULT_HEIGHT)
    if (overlap / area >= DISCONNECT_OVERLAP_RATIO) return { id: n.id, disconnect: true }
  }
  for (const n of allNodes) {
    if (n.id === draggedId) continue
    const connected = currentEdges.some(e =>
      (e.source === draggedId && e.target === n.id) || (e.source === n.id && e.target === draggedId))
    if (connected) continue
    const overlap = rectsOverlapArea(pos.x, pos.y, DEFAULT_WIDTH, DEFAULT_HEIGHT, n.position.x, n.position.y, DEFAULT_WIDTH, DEFAULT_HEIGHT)
    if (overlap / area >= CONNECT_OVERLAP_RATIO) return { id: n.id, disconnect: false }
  }
  return null
}

function viewportKey(boardId: string) { return `sketch_viewport_${boardId}` }

function SketchCanvasInner({ boardId }: { boardId: string }) {
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
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null)
  const [hoverWillDisconnect, setHoverWillDisconnect] = useState(false)
  const hoverWillDisconnectRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [hoveringTrash, setHoveringTrash] = useState(false)
  const trashRef = useRef<HTMLDivElement>(null)
  const hoveringTrashRef = useRef(false)
  useEffect(() => { hoveringTrashRef.current = hoveringTrash }, [hoveringTrash])

  const nodesRef = useRef(nodes)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  const edgesRef = useRef(edges)
  useEffect(() => { edgesRef.current = edges }, [edges])
  const hoverTargetIdRef = useRef<string | null>(null)
  const dragStartPositionRef = useRef<{ x: number; y: number } | null>(null)
  // connect 발생 시 React Flow의 onNodesChange(dragging:false) 자동 덮어쓰기를
  // 인터셉트해서 drag-end 위치 대신 origin을 적용하기 위한 플래그
  const pendingOriginRef = useRef<{ nodeId: string; origin: { x: number; y: number } } | null>(null)

  const handleContentChange = useCallback((id: string, content: string) => {
    supabase.from('sketch_cards').update({ content }).eq('id', id)
      .then(({ error }) => { if (error) console.error('카드 내용 저장 실패:', error.message) })
  }, [])

  const handleColorChange = useCallback((id: string, color: CategoryColorKey) => {
    supabase.from('sketch_cards').update({ color }).eq('id', id)
      .then(({ error }) => { if (error) console.error('카드 색상 저장 실패:', error.message) })
    setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, color } } : n))
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await supabase.from('sketch_cards').delete().eq('id', id)
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id))
  }, [])

  const handlers = { onContentChange: handleContentChange, onColorChange: handleColorChange, onDelete: handleDelete }

  // [진단용] customOnNodesChange: pendingOriginRef 인터셉트 방식의 타이밍 문제를 로그로 확인
  // → onNodesChange가 onNodeDragStop보다 먼저 발사되면 pendingOriginRef가 아직 null이어서 인터셉트 불가
  const customOnNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    const hasPositionEnd = changes.some(c => c.type === 'position' && (c as { dragging?: boolean }).dragging === false)
    if (hasPositionEnd) {
      console.log('[customOnNodesChange] dragging:false 수신, pendingOriginRef:', pendingOriginRef.current)
    }
    if (!pendingOriginRef.current) { onNodesChange(changes); return }
    const { nodeId, origin } = pendingOriginRef.current
    let intercepted = false
    const patched = changes.map(c => {
      if (c.type === 'position' && c.id === nodeId && (c as { dragging?: boolean }).dragging === false) {
        intercepted = true
        console.log('[customOnNodesChange] 인터셉트 성공 — origin 적용:', origin)
        return { ...c, position: origin, positionAbsolute: origin }
      }
      return c
    })
    if (intercepted) pendingOriginRef.current = null
    onNodesChange(patched)
  }, [onNodesChange])

  // ── 위치 저장: 주어진 position을 DB에 저장 ────────────────────────────────
  const savePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    supabase.from('sketch_cards')
      .update({ position_x: position.x, position_y: position.y })
      .eq('id', nodeId)
      .then(({ error }) => { if (error) console.error('카드 위치 저장 실패:', error.message) })
  }, [])

  // ── 연결 생성: DB 확인 후 setEdges (낙관적 업데이트 없음 — id가 DB에서 발급되므로) ──
  const handleConnect = useCallback((sourceId: string, targetId: string) => {
    supabase.from('sketch_edges')
      .insert({ board_id: boardId, source_card_id: sourceId, target_card_id: targetId })
      .select().single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.error('연결 생성 실패:', error?.message)
          alert('연결 생성에 실패했습니다. 다시 시도해주세요.')
          return
        }
        setEdges(eds => [...eds, edgeFromRow(data as SketchEdge)])
      })
  }, [boardId])

  // ── 연결 해제: 낙관적 삭제 → DB 실패 시 롤백 + alert ────────────────────────
  const handleDisconnect = useCallback((edge: Edge) => {
    // a) 즉시 UI 반영
    setEdges(prev => prev.filter(e => e.id !== edge.id))
    // b) DB 삭제
    supabase.from('sketch_edges').delete().eq('id', edge.id)
      .then(({ error }) => {
        if (error) {
          // c) 실패 시 롤백
          setEdges(prev => [...prev, edge])
          console.error('연결 해제 실패:', error.message)
          alert('연결 해제에 실패했습니다. 다시 시도해주세요.')
        }
      })
  }, [])

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    handleConnect(connection.source, connection.target)
  }, [handleConnect])

  // handleEdgesDelete는 React Flow가 edge를 이미 제거한 뒤 호출하므로
  // edge 객체를 직접 넘겨 롤백 시 복원할 수 있도록 함
  const handleEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach(edge => handleDisconnect(edge))
  }, [handleDisconnect])

  useEffect(() => {
    Promise.all([
      supabase.from('sketch_boards').select('*').eq('id', boardId).single(),
      supabase.from('sketch_cards').select('*').eq('board_id', boardId).order('created_at'),
      supabase.from('sketch_edges').select('*').eq('board_id', boardId),
    ]).then(([boardRes, cardsRes, edgesRes]) => {
      if (boardRes.data) { setBoard(boardRes.data as SketchBoard); setNameInput(boardRes.data.name) }
      const cards = (cardsRes.data ?? []) as SketchCard[]
      setNodes(cards.map(c => cardToNode(c, handlers)))
      setEdges(((edgesRes.data ?? []) as SketchEdge[]).map(edgeFromRow))
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId])

  async function createCard(x: number, y: number) {
    const color = COLOR_KEYS[nodes.length % COLOR_KEYS.length]
    const position_x = x - DEFAULT_WIDTH / 2
    const position_y = y - DEFAULT_HEIGHT / 2
    const { data, error } = await supabase.from('sketch_cards')
      .insert({ board_id: boardId, content: '', color, position_x, position_y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
      .select().single()
    if (error || !data) { console.error('카드 생성 실패:', error?.message); return }
    setNodes(prev => [...prev, cardToNode(data as SketchCard, handlers)])
  }

  function handlePaneDoubleClick(e: React.MouseEvent) {
    if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    createCard(pos.x, pos.y)
  }

  function handleAddButtonClick() {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    const pos = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    createCard(pos.x, pos.y)
  }

  const handleAddButtonClickRef = useRef(handleAddButtonClick)
  useEffect(() => { handleAddButtonClickRef.current = handleAddButtonClick })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return
      if (target.getAttribute('contenteditable') === 'true') return
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); handleAddButtonClickRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function eventClientPoint(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
    if ('clientX' in e) return { x: e.clientX, y: e.clientY }
    if ('touches' in e && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    return null
  }

  function isOverTrash(e: MouseEvent | TouchEvent): boolean {
    const p = eventClientPoint(e)
    const rect = trashRef.current?.getBoundingClientRect()
    if (!p || !rect) return false
    return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom
  }

  const handleNodeDragStart: OnNodeDrag<CardNode> = useCallback((_e, node) => {
    setIsDragging(true)
    dragStartPositionRef.current = { x: node.position.x, y: node.position.y }
    console.log('[DragStart] origin saved:', dragStartPositionRef.current)
  }, [])

  // hoverTargetIdRef·hoverWillDisconnectRef는 동기적으로 업데이트하여
  // dragStop 시점에 ref가 항상 최신 drag 상태를 참조하도록 보장
  const handleNodeDrag: OnNodeDrag<CardNode> = useCallback((e, node) => {
    const overTrash = isOverTrash(e)
    if (overTrash !== hoveringTrashRef.current) setHoveringTrash(overTrash)
    if (overTrash) {
      if (hoverTargetIdRef.current !== null) {
        hoverTargetIdRef.current = null
        hoverWillDisconnectRef.current = false
        setHoverTargetId(null)
      }
      return
    }
    const target = detectOverlap(node.id, node.position, nodesRef.current, edgesRef.current)
    const newId = target?.id ?? null
    const newDisconnect = target?.disconnect ?? false
    hoverTargetIdRef.current = newId
    hoverWillDisconnectRef.current = newDisconnect
    if (newId !== hoverTargetId) setHoverTargetId(newId)
    if (newDisconnect !== hoverWillDisconnect) setHoverWillDisconnect(newDisconnect)
  }, [hoverTargetId, hoverWillDisconnect])

  // dragStop: 겹침 판정 결과에 따라 위치 저장 + connect/disconnect 처리
  const handleNodeDragStop: OnNodeDrag<CardNode> = useCallback((e, node) => {
    // 1. drag 상태 정리
    setIsDragging(false)
    hoverTargetIdRef.current = null
    hoverWillDisconnectRef.current = false
    setHoverTargetId(null)

    // 2. 휴지통 드롭 처리
    if (hoveringTrashRef.current) {
      setHoveringTrash(false)
      handleDelete(node.id)
      return
    }

    // 3. 겹침 판정
    const overlap = detectOverlap(node.id, node.position, nodesRef.current, edgesRef.current)

    // 4a. connect: origin 위치로 복귀
    //   - pendingOriginRef 인터셉트 방식은 onNodesChange 발사 타이밍에 따라 실패할 수 있음
    //   - setTimeout(0)으로 React Flow의 모든 drag-end 상태 업데이트가 끝난 뒤 setNodes 강제 적용
    //   - DB도 origin으로 저장 → 화면과 DB가 항상 같은 값을 가리킴
    if (overlap && !overlap.disconnect) {
      const origin = dragStartPositionRef.current
      const capturedId = node.id
      console.log('[DragStop] connect 감지 — origin:', origin, '/ dropPos:', { x: node.position.x, y: node.position.y })
      if (origin) {
        pendingOriginRef.current = { nodeId: capturedId, origin }  // 인터셉트도 병행(진단용)
        savePosition(capturedId, origin)
        setTimeout(() => {
          console.log('[DragStop] setTimeout(0) — setNodes로 origin 적용:', origin)
          setNodes(nds => nds.map(n => n.id === capturedId ? { ...n, position: origin } : n))
          pendingOriginRef.current = null
        }, 0)
      }
      handleConnect(capturedId, overlap.id)
      return
    }

    // 4b. disconnect: 연결 해제 + origin 복귀 (connect와 동일한 타이밍 처리)
    //   - pendingOriginRef는 connect 진단 전용이므로 disconnect에서는 건드리지 않음
    //     → ref 공유로 인한 덮어쓰기 위험 없음 (드래그 1회 = connect or disconnect 중 하나)
    if (overlap?.disconnect) {
      const origin = dragStartPositionRef.current
      const capturedId = node.id
      console.log('[DragStop] disconnect 감지 — origin:', origin, '/ dropPos:', { x: node.position.x, y: node.position.y })
      const existing = edgesRef.current.find(e =>
        (e.source === capturedId && e.target === overlap.id) || (e.source === overlap.id && e.target === capturedId))
      if (existing) handleDisconnect(existing)
      if (origin) {
        savePosition(capturedId, origin)
        setTimeout(() => {
          console.log('[DragStop] setTimeout(0) — disconnect origin 적용:', origin)
          setNodes(nds => nds.map(n => n.id === capturedId ? { ...n, position: origin } : n))
        }, 0)
      } else {
        savePosition(capturedId, node.position)
      }
      return
    }

    // 4c. 단순 이동: drag-end 위치 그대로 저장
    savePosition(node.id, node.position)
  }, [savePosition, handleConnect, handleDisconnect, handleDelete, setNodes])

  async function saveBoardName() {
    const name = nameInput.trim()
    if (!name || !board || name === board.name) { setNameInput(board?.name ?? ''); return }
    await supabase.from('sketch_boards').update({ name }).eq('id', board.id)
    setBoard(prev => prev ? { ...prev, name } : prev)
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center text-[13px]" style={{ color: 'rgba(226,232,240,0.35)' }}>불러오는 중…</div>
  }

  if (!board) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-[13px]" style={{ color: 'rgba(226,232,240,0.35)' }}>보드를 찾을 수 없습니다</p>
        <Link href="/sketch" className="text-[12px] px-4 py-1.5 rounded-full transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(226,232,240,0.5)' }}>
          목록으로
        </Link>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
        <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.3)' }}>카드 {nodes.length}개</span>
        <button
          onClick={handleAddButtonClick}
          className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-colors flex-shrink-0"
          style={{ background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.35)', color: '#9DBEF5' }}
        >
          <Plus size={13} /> 새 카드
          <span className="text-[10px] font-mono opacity-50">N</span>
        </button>
      </div>

      <div ref={wrapperRef} className="flex-1 min-h-0 rounded-2xl overflow-hidden relative"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        onDoubleClick={handlePaneDoubleClick}>
        {hoverTargetId && (() => {
          const c = hoverWillDisconnect ? 'rgba(248,113,113,0.7)' : EDGE_COLOR
          return <style>{`.react-flow__node[data-id="${hoverTargetId}"] > div { box-shadow: 0 0 0 2px ${c}, 0 0 18px 3px ${c}; }`}</style>
        })()}
        {viewportReady && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={customOnNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgesDelete={handleEdgesDelete}
            deleteKeyCode={['Backspace', 'Delete']}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
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
            <MiniMap
              pannable zoomable
              maskColor="rgba(15,19,25,0.6)"
              style={{ background: '#161B24', border: '1px solid rgba(255,255,255,0.09)' }}
              nodeColor={n => CATEGORY_PALETTE[(n.data as CardData).color]?.solid ?? '#6B9BE0'}
            />
          </ReactFlow>
        )}
        {isDragging && (
          <div ref={trashRef}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center rounded-full transition-all"
            style={{
              width: hoveringTrash ? 56 : 46,
              height: hoveringTrash ? 56 : 46,
              background: hoveringTrash ? 'rgba(248,113,113,0.9)' : 'rgba(22,27,36,0.9)',
              border: `1px solid ${hoveringTrash ? 'rgba(248,113,113,1)' : 'rgba(255,255,255,0.15)'}`,
              boxShadow: hoveringTrash ? '0 0 24px rgba(248,113,113,0.5)' : '0 4px 12px rgba(0,0,0,0.3)',
            }}>
            <Trash2 size={hoveringTrash ? 22 : 18} color={hoveringTrash ? '#fff' : 'rgba(226,232,240,0.6)'} />
          </div>
        )}
      </div>
      <p className="text-center text-[11px] pt-2 flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>
        {nodes.length === 0
          ? <>더블클릭 또는 <span className="font-mono">N</span> 키로 카드를 만드세요</>
          : <>카드 왼쪽은 이동, 오른쪽은 바로 입력 · 겹쳐 놓으면 연결 · 드래그 중 하단 휴지통에 놓으면 삭제</>}
      </p>
    </div>
  )
}

export default function SketchCanvas({ boardId }: { boardId: string }) {
  return (
    <ReactFlowProvider>
      <SketchCanvasInner boardId={boardId} />
    </ReactFlowProvider>
  )
}
