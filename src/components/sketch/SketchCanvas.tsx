'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, MarkerType,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type NodeProps, type NodeTypes, type OnNodeDrag, type Edge, type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import { ArrowLeft, Plus } from 'lucide-react'
import type { SketchBoard, SketchCard, SketchEdge } from '@/types'
import SketchCardModal from './SketchCardModal'

const COLOR_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[]
const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 140
const OVERLAP_RATIO = 0.5 // 드래그한 카드 면적의 이 비율 이상 겹치면 연결
const EDGE_COLOR = 'rgba(157,190,245,0.55)'
const EDGE_STYLE = { stroke: EDGE_COLOR, strokeWidth: 1.5 }
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 }

function edgeFromRow(row: SketchEdge): Edge {
  return { id: row.id, source: row.source_card_id, target: row.target_card_id, markerEnd: EDGE_MARKER, style: EDGE_STYLE }
}

export type CardData = { content: string; color: CategoryColorKey }
export type CardNode = Node<CardData, 'sticky'>

function StickyCardNode({ data }: NodeProps<CardNode>) {
  const palette = CATEGORY_PALETTE[data.color]
  return (
    <div
      className="group relative h-full w-full flex rounded-xl overflow-hidden shadow-lg cursor-pointer"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      <Handle type="target" position={Position.Left}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ width: 10, height: 10, background: palette.solid, border: '2px solid rgba(255,255,255,0.7)' }} />
      <Handle type="source" position={Position.Right}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ width: 10, height: 10, background: palette.solid, border: '2px solid rgba(255,255,255,0.7)' }} />
      <div className="w-[3px] flex-shrink-0" style={{ background: palette.solid }} />
      <div className="flex-1 min-w-0 p-2.5 text-[13px] leading-snug whitespace-pre-wrap overflow-hidden">
        {data.content
          ? <span style={{ color: '#E2E8F0' }}>{data.content}</span>
          : <span style={{ color: 'rgba(226,232,240,0.35)' }}>생각을 적어보세요…</span>}
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = { sticky: StickyCardNode }

function cardToNode(card: SketchCard): CardNode {
  return {
    id: card.id,
    type: 'sticky',
    position: { x: card.position_x, y: card.position_y },
    style: { width: card.width, height: card.height },
    data: { content: card.content, color: card.color as CategoryColorKey },
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null)

  const nodesRef = useRef(nodes)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  const hoverTargetIdRef = useRef<string | null>(null)
  useEffect(() => { hoverTargetIdRef.current = hoverTargetId }, [hoverTargetId])
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)

  const handleContentChange = useCallback((id: string, content: string) => {
    supabase.from('sketch_cards').update({ content }).eq('id', id)
    setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, content } } : n))
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
      setNodes(cards.map(cardToNode))
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
    setNodes(prev => [...prev, cardToNode(data as SketchCard)])
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

  const editingCard = editingId ? nodes.find(n => n.id === editingId) ?? null : null

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
          onNodeClick={(_e, node) => setEditingId(node.id)}
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
          : <>카드를 클릭해 편집하고, 다른 카드 위에 겹쳐서 놓으면 연결됩니다</>}
      </p>

      {editingCard && (
        <SketchCardModal
          card={editingCard}
          allCards={nodes.filter(n => n.id !== editingCard.id)}
          connectedEdges={edges.filter(e => e.source === editingCard.id || e.target === editingCard.id)}
          onContentChange={handleContentChange}
          onColorChange={handleColorChange}
          onDelete={id => { handleDelete(id); setEditingId(null) }}
          onAddConnection={targetId => createConnection(editingCard.id, targetId)}
          onRemoveConnection={removeConnection}
          onClose={() => setEditingId(null)}
        />
      )}
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
