'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, MarkerType, addEdge,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type NodeProps, type NodeTypes, type OnNodeDrag, type Edge, type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import type { SketchBoard, SketchCard, SketchEdge } from '@/types'

const COLOR_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[]
const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 140
const EDGE_COLOR = 'rgba(157,190,245,0.55)'
const EDGE_STYLE = { stroke: EDGE_COLOR, strokeWidth: 1.5 }
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 }

function edgeFromRow(row: SketchEdge): Edge {
  return { id: row.id, source: row.source_card_id, target: row.target_card_id, markerEnd: EDGE_MARKER, style: EDGE_STYLE }
}

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
      className="group relative h-full w-full flex flex-col rounded-2xl p-2.5 shadow-lg"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, backdropFilter: 'blur(6px)' }}
    >
      <Handle type="target" position={Position.Left}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ width: 10, height: 10, background: palette.solid, border: `2px solid ${palette.text}` }} />
      <Handle type="source" position={Position.Right}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ width: 10, height: 10, background: palette.solid, border: `2px solid ${palette.text}` }} />
      <div className="flex items-center gap-1 mb-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {COLOR_KEYS.map(key => (
          <button
            key={key}
            className="nodrag nopan w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform hover:scale-125"
            style={{ background: CATEGORY_PALETTE[key].solid, outline: key === data.color ? `1.5px solid ${CATEGORY_PALETTE[key].text}` : 'none', outlineOffset: 1.5 }}
            onClick={() => data.onColorChange(id, key)}
          />
        ))}
        <button
          className="nodrag nopan ml-auto hover:text-red-400 transition-colors flex-shrink-0"
          style={{ color: palette.text }}
          onClick={() => data.onDelete(id)}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <textarea
        className="nodrag nopan flex-1 min-h-0 w-full bg-transparent resize-none focus:outline-none text-[13px] leading-snug placeholder:opacity-40"
        style={{ color: palette.text }}
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="생각을 적어보세요…"
      />
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

function SketchCanvasInner({ boardId }: { boardId: string }) {
  const supabase = createClient()
  const { screenToFlowPosition } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [board, setBoard] = useState<SketchBoard | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

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

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    supabase.from('sketch_edges')
      .insert({ board_id: boardId, source_card_id: connection.source, target_card_id: connection.target })
      .select().single()
      .then(({ data, error }) => {
        if (error || !data) { console.error('연결 생성 실패:', error?.message); return }
        setEdges(eds => addEdge({ ...connection, id: (data as SketchEdge).id, markerEnd: EDGE_MARKER, style: EDGE_STYLE }, eds))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId])

  const handleEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach(e => { supabase.from('sketch_edges').delete().eq('id', e.id) })
  }, [])

  const handlers = { onContentChange: handleContentChange, onColorChange: handleColorChange, onDelete: handleDelete }

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

  const handleNodeDragStop: OnNodeDrag<CardNode> = useCallback((_e, node) => {
    supabase.from('sketch_cards').update({ position_x: node.position.x, position_y: node.position.y }).eq('id', node.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      <div ref={wrapperRef} className="flex-1 min-h-0 rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        onDoubleClick={handlePaneDoubleClick}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={handleEdgesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          nodeTypes={nodeTypes}
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
          : <>카드에 마우스를 올리면 좌우 점을 드래그해 서로 연결할 수 있어요</>}
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
