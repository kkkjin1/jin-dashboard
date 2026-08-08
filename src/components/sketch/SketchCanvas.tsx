'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, MarkerType, BaseEdge, getStraightPath, useInternalNode,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type NodeProps, type NodeTypes, type OnNodeDrag, type Edge, type EdgeTypes, type EdgeProps, type OnConnect,
  type InternalNode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import { ArrowLeft, Plus, Trash2, GripVertical } from 'lucide-react'
import type { SketchBoard, SketchCard, SketchEdge } from '@/types'

const COLOR_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[]
const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 140
const OVERLAP_RATIO = 0.5 // 드래그한 카드 면적의 이 비율 이상 겹치면 연결
const EDGE_COLOR = 'rgba(157,190,245,0.55)'
const EDGE_STYLE = { stroke: EDGE_COLOR, strokeWidth: 1.5 }
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 }

function edgeFromRow(row: SketchEdge): Edge {
  return { id: row.id, source: row.source_card_id, target: row.target_card_id, type: 'floating', markerEnd: EDGE_MARKER, style: EDGE_STYLE }
}

// ── 카드 위치가 바뀌어도 항상 두 카드 경계를 잇는 직선으로 다시 그려지는 edge ──
// (기본 bezier edge는 핸들 방향이 고정이라 카드를 재배치해도 곡선이 그대로 남는 문제가 있음)
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

      {/* 상단 컨트롤 (호버 시 노출) */}
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

      {/* 본문: 텍스트는 카드 전체 폭 사용, 왼쪽 절반 위에만 드래그 전용 투명 오버레이를 얹음 */}
      <div className="flex-1 min-h-0 relative px-2 pb-2">
        <textarea
          className="nodrag nopan absolute inset-0 w-full h-full bg-transparent resize-none focus:outline-none text-[12.5px] leading-snug placeholder:opacity-40"
          style={{ color: '#E2E8F0', padding: '0 2px' }}
          value={text}
          onChange={e => handleChange(e.target.value)}
          placeholder="생각을 적어보세요…"
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

function SketchCanvasInner({ boardId }: { boardId: string }) {
  const supabase = createClient()
  const { screenToFlowPosition } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [board, setBoard] = useState<SketchBoard | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null)

  const nodesRef = useRef(nodes)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  const hoverTargetIdRef = useRef<string | null>(null)
  useEffect(() => { hoverTargetIdRef.current = hoverTargetId }, [hoverTargetId])
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)

  const handleContentChange = useCallback((id: string, content: string) => {
    supabase.from('sketch_cards').update({ content }).eq('id', id)
  }, [])

  const handleColorChange = useCallback((id: string, color: CategoryColorKey) => {
    supabase.from('sketch_cards').update({ color }).eq('id', id)
    setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, color } } : n))
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await supabase.from('sketch_cards').delete().eq('id', id)
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id))
  }, [])

  const handlers = { onContentChange: handleContentChange, onColorChange: handleColorChange, onDelete: handleDelete }

  const createConnection = useCallback((sourceId: string, targetId: string) => {
    supabase.from('sketch_edges')
      .insert({ board_id: boardId, source_card_id: sourceId, target_card_id: targetId })
      .select().single()
      .then(({ data, error }) => {
        if (error || !data) { console.error('연결 생성 실패:', error?.message); return }
        setEdges(eds => [...eds, edgeFromRow(data as SketchEdge)])
      })
  }, [boardId])

  const removeConnection = useCallback((edgeId: string) => {
    supabase.from('sketch_edges').delete().eq('id', edgeId)
    setEdges(prev => prev.filter(e => e.id !== edgeId))
  }, [])

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    createConnection(connection.source, connection.target)
  }, [createConnection])

  const handleEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach(e => removeConnection(e.id))
  }, [removeConnection])

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

  // 'N' 단축키 — 입력 중(텍스트/보드명 편집)이 아닐 때만 새 카드 생성
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

  // 드래그 중인 카드와 절반 이상 겹치는 다른 카드를 찾음 (전부 고정 크기라 상수로 계산)
  function findOverlapTarget(draggedId: string, pos: { x: number; y: number }) {
    const area = DEFAULT_WIDTH * DEFAULT_HEIGHT
    for (const n of nodesRef.current) {
      if (n.id === draggedId) continue
      const overlap = rectsOverlapArea(pos.x, pos.y, DEFAULT_WIDTH, DEFAULT_HEIGHT, n.position.x, n.position.y, DEFAULT_WIDTH, DEFAULT_HEIGHT)
      if (overlap >= area * OVERLAP_RATIO) return n.id
    }
    return null
  }

  const handleNodeDragStart: OnNodeDrag<CardNode> = useCallback((_e, node) => {
    dragStartPosRef.current = { x: node.position.x, y: node.position.y }
  }, [])

  const handleNodeDrag: OnNodeDrag<CardNode> = useCallback((_e, node) => {
    const target = findOverlapTarget(node.id, node.position)
    if (target !== hoverTargetIdRef.current) setHoverTargetId(target)
  }, [])

  const handleNodeDragStop: OnNodeDrag<CardNode> = useCallback((_e, node) => {
    const target = findOverlapTarget(node.id, node.position)
    setHoverTargetId(null)
    if (target) {
      createConnection(node.id, target)
      const original = dragStartPosRef.current
      if (original) setNodes(prev => prev.map(n => n.id === node.id ? { ...n, position: original } : n))
    } else {
      supabase.from('sketch_cards').update({ position_x: node.position.x, position_y: node.position.y }).eq('id', node.id)
    }
    dragStartPosRef.current = null
  }, [createConnection])

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
      {/* 헤더 */}
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

      {/* 캔버스 */}
      <div ref={wrapperRef} className="flex-1 min-h-0 rounded-2xl overflow-hidden relative"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        onDoubleClick={handlePaneDoubleClick}>
        {hoverTargetId && (
          <style>{`.react-flow__node[data-id="${hoverTargetId}"] > div { box-shadow: 0 0 0 2px ${EDGE_COLOR}, 0 0 18px 3px ${EDGE_COLOR}; }`}</style>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={handleEdgesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          colorMode="dark"
          fitView
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
      </div>
      <p className="text-center text-[11px] pt-2 flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>
        {nodes.length === 0
          ? <>더블클릭 또는 <span className="font-mono">N</span> 키로 카드를 만드세요</>
          : <>카드 왼쪽은 이동, 오른쪽은 바로 입력 · 겹쳐 놓으면 연결</>}
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
