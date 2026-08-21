'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, MarkerType, BaseEdge, getStraightPath, useInternalNode, NodeResizer,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type NodeProps, type NodeTypes, type OnNodeDrag, type Edge, type EdgeTypes, type EdgeProps, type OnConnect,
  type InternalNode, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useAutosave } from '@/hooks/useAutosave'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import { ArrowLeft, Plus, Trash2, GripVertical, Frame } from 'lucide-react'
import type { SketchBoard, SketchCard, SketchEdge, SketchFrame } from '@/types'
import { FrameNodeComponent, type FrameData, type FrameNodeType } from './FrameNode'

// ── 상수 ──────────────────────────────────────────────────────────────────────
const COLOR_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[]
const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 140
const CONNECT_OVERLAP_RATIO = 0.6
const DISCONNECT_OVERLAP_RATIO = 0.55
const FRAME_PADDING = 24
const FRAME_LABEL_SPACE = 100 // 프레임 안쪽 좌상단 대형 라벨(FrameNode.tsx)이 첫 카드와 겹치지 않도록 새 프레임 생성 시 위쪽에 확보하는 여유 공간
const CHILD_H_GAP = FRAME_PADDING // Tab으로 만든 형제 카드 사이 가로 간격 — 기존 프레임 패딩과 톤 통일
const CHILD_V_GAP = 56 // Tab으로 만든 자식 카드와 부모 카드 사이 세로 간격
const EDGE_COLOR = 'rgba(157,190,245,0.55)'
const EDGE_STYLE = { stroke: EDGE_COLOR, strokeWidth: 1.5 }
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 16, height: 16 }

// ── Edge helpers ───────────────────────────────────────────────────────────────
function edgeFromRow(row: SketchEdge): Edge {
  return {
    id: row.id, source: row.source_card_id, target: row.target_card_id, type: 'floating',
    markerEnd: EDGE_MARKER, style: EDGE_STYLE,
    // 지금은 스타일 분기 없이 그대로 실어 보내기만 함 — 나중에 위계 연결(kind
    // === 'hierarchy')만 다르게 그리고 싶을 때 FloatingEdge에서 바로 꺼내 쓸 수 있게.
    data: { kind: row.kind },
  }
}

function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode) {
  const w = (intersectionNode.measured.width ?? DEFAULT_WIDTH) / 2
  const h = (intersectionNode.measured.height ?? DEFAULT_HEIGHT) / 2
  const pos = intersectionNode.internals.positionAbsolute
  const targetPos = targetNode.internals.positionAbsolute
  const targetW = (targetNode.measured.width ?? DEFAULT_WIDTH) / 2
  const targetH = (targetNode.measured.height ?? DEFAULT_HEIGHT) / 2
  const x2 = pos.x + w, y2 = pos.y + h
  const x1 = targetPos.x + targetW, y1 = targetPos.y + targetH
  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1)
  const xx3 = a * xx1, yy3 = a * yy1
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

// ── CardNode ──────────────────────────────────────────────────────────────────
type CardData = {
  content: string
  color: CategoryColorKey
  onContentChange: (id: string, content: string) => void
  onColorChange: (id: string, color: CategoryColorKey) => void
  onDelete: (id: string) => void
  onResize: (id: string, box: { x: number; y: number; width: number; height: number }) => void
  supabase: SupabaseClient
  /** Tab으로 자식 카드를 만들 때만 true — 마운트 시 1회 편집모드로 자동 진입시킨다. */
  autoFocus?: boolean
}
type CardNode = Node<CardData, 'sticky'>

// 예전 저장분은 순수 텍스트라 그대로 HTML로 꽂으면 <, &, > 가 깨짐 — 우리가 저장한
// 적 있는(빨간펜 span 등 태그 포함) 콘텐츠만 HTML로 신뢰하고, 그 외엔 escape 처리
function toDisplayHtml(content: string): string {
  if (/<(span|br|div)[\s/>]/i.test(content)) return content
  return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const RED = '#EF4444'
const BASE_TEXT = '#E2E8F0'

function StickyCardNode({ id, data, selected }: NodeProps<CardNode>) {
  const editorRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const palette = CATEGORY_PALETTE[data.color]
  const [isEditing, setIsEditing] = useState(false)
  // 텍스트 선택 드래그 중(마우스 버튼 down)에는 왼쪽 절반 드래그 오버레이가 마우스
  // 이벤트를 가로채면 안 됨 — 그래야 선택 드래그가 카드 왼쪽으로 넘어가도 끊기지
  // 않는다. isEditing(포커스 여부)로 게이팅하면, 입력을 마치고 드래그 없이 바로
  // 왼쪽 핸들을 클릭했을 때 그 클릭이 오버레이를 그대로 통과해 여전히 focus된
  // (그리고 nodrag인) contentEditable에 떨어져버려 blur도, 드래그 시작도 안 되는
  // 버그가 있었다 — 그래서 "실제 드래그 중"만 별도로 추적한다.
  const [isSelecting, setIsSelecting] = useState(false)

  // mouseup은 "mousedown이 어디서 시작됐는지"가 아니라 버튼을 뗀 순간 커서 아래
  // 있는 엘리먼트를 타겟으로 잡는다 — 카드 밖(캔버스 배경)까지 드래그했다가 거기서
  // 버튼을 떼면 이 div의 onMouseUp은 안 불리고, blur도 안 일어난다(새 mousedown이
  // 없으면 focus가 그대로 유지되는 게 정상 동작이라 blur가 안전망이 못 됨) —
  // isSelecting이 true로 stuck되는 걸 막기 위해 window 전체에서 mouseup을 받는다.
  useEffect(() => {
    if (!isSelecting) return
    const onWindowMouseUp = () => setIsSelecting(false)
    window.addEventListener('mouseup', onWindowMouseUp)
    return () => window.removeEventListener('mouseup', onWindowMouseUp)
  }, [isSelecting])

  // 최초 1회만 innerHTML 세팅 — 이후엔 DOM이 진실 소스라 React가 다시 덮어쓰면
  // (매 렌더마다) 커서 위치가 튀어버림
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = toDisplayHtml(data.content)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tab으로 만든 자식 카드만 마운트 시 1회 자동으로 편집모드 진입 (data.autoFocus는
  // 생성 시점에만 실어 보내는 값이라 리렌더돼도 다시 안 트리거됨 — deps [] 고정).
  // 새로 추가된 노드는 React Flow가 실제 크기를 측정(ResizeObserver)하기 전까지
  // wrapper div에 style.visibility='hidden'을 직접 걸어둔다 — 그 구간에
  // element.focus()를 호출하면 브라우저가 조용히 무시한다(포커스 불가능한
  // 엘리먼트). 측정이 끝나 visibility가 풀릴 때까지 프레임 단위로 재시도.
  useEffect(() => {
    if (!data.autoFocus) return
    let rafId: number
    let attempts = 0
    const tryFocus = () => {
      const el = editorRef.current
      if (!el) return
      const hidden = getComputedStyle(el).visibility === 'hidden'
      if (hidden && attempts < 30) {
        attempts += 1
        rafId = requestAnimationFrame(tryFocus)
        return
      }
      el.focus()
    }
    rafId = requestAnimationFrame(tryFocus)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave (카드 본문, 텍스트 필드 우선 STEP) — canonical UPDATE(onContentChange)는
  // 그대로 유지, 이 훅은 autosave_drafts/content_versions에만 병행 기록한다.
  // 이 상태는 오직 훅에 넘길 값 추적용이라 editorRef.innerHTML을 되돌려쓰지 않음
  // (DOM이 계속 진실 소스, 커서 위치 보존). entity_id는 항상 실존하는
  // sketch_cards.id이므로 qid/rebind 불필요. 카드가 많을 때 마운트 시 동시
  // 부트스트랩 요청이 몰리지 않도록 세부task title과 동일하게 편집 중(포커스)에만 활성화.
  const [autosaveContent, setAutosaveContent] = useState(data.content)
  useAutosave({
    supabase: data.supabase,
    enabled: isEditing,
    entityType: 'sketch_card',
    entityId: id,
    fieldKey: 'content',
    value: autosaveContent,
  })

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const html = e.currentTarget.innerHTML
    setAutosaveContent(html)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => data.onContentChange(id, html), 500)
  }

  // 다른 서식은 없어도 "빨간펜"(Alt+1) 만은 지원 — 선택 영역 있으면 그 부분만, 없으면 전체 토글
  function toggleRedPen() {
    document.execCommand('styleWithCSS', false, 'true')
    const current = document.queryCommandValue('foreColor')
    const isRed = current === 'rgb(239, 68, 68)' || current.toLowerCase() === RED.toLowerCase()
    document.execCommand('foreColor', false, isRed ? BASE_TEXT : RED)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.altKey && e.key === '1') { e.preventDefault(); toggleRedPen() }
  }

  return (
    <>
      {/* 카드 본체가 overflow-hidden이라 그 안에 두면 리사이즈 핸들이 잘려서 안 보임 —
          그래서 형제 레벨에 둔다. 연결선(테두리)은 안 보이게 하고 핸들만 노출. */}
      <NodeResizer
        nodeId={id}
        isVisible={!!selected}
        minWidth={160}
        minHeight={100}
        lineStyle={{ borderColor: 'transparent' }}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: palette.solid, border: '1.5px solid rgba(255,255,255,0.85)' }}
        onResizeEnd={(_event, params) => data.onResize(id, params)}
      />
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
        <div
          ref={editorRef}
          contentEditable
          // tabIndex 없는 contentEditable은 클릭으로는 focus가 걸리지만
          // element.focus()로는 (크롬에서) 조용히 실패한다 — Tab 자식 생성 후
          // 자동 편집모드 진입(programmatic focus)이 필요해서 -1로 스크립트
          // focus만 가능하게 열어둔다(일반 Tab 키 순회 대상에는 안 들어감).
          tabIndex={-1}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsEditing(true)}
          onBlur={() => { setIsEditing(false); setIsSelecting(false) }}
          onMouseDown={() => setIsSelecting(true)}
          onMouseUp={() => setIsSelecting(false)}
          className="nodrag nopan scrollbar-hide absolute inset-0 w-full h-full overflow-y-auto bg-transparent focus:outline-none text-[12.5px] leading-snug"
          style={{ color: BASE_TEXT, padding: '4px 10px 4px 16px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
        />
        <div
          className={`absolute inset-y-0 left-0 w-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing ${isSelecting ? 'pointer-events-none' : ''}`}
        >
          <GripVertical size={14} className="opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none" style={{ color: palette.solid }} />
        </div>
      </div>
      </div>
    </>
  )
}

// ── 겹침 판정 (프레임 소속 여부와 무관하게 절대좌표 기준으로 비교) ────────────────
// 프레임 소속 카드의 position은 프레임 기준 상대좌표라, 자유 카드의 절대좌표와
// 그대로 비교하면 안 됨. 비교 전에 항상 이 함수로 절대좌표로 변환해야 한다.
function toAbsolutePosition(
  pos: { x: number; y: number },
  parentId: string | undefined,
  frames: SketchFrame[],
): { x: number; y: number } {
  if (!parentId) return pos
  const frame = frames.find(f => f.id === parentId)
  if (!frame) return pos
  return { x: frame.position_x + pos.x, y: frame.position_y + pos.y }
}

function rectsOverlapArea(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  const w = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx))
  const h = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by))
  return w * h
}

function detectOverlap(
  draggedId: string,
  pos: { x: number; y: number }, // 절대좌표
  draggedSize: { width: number; height: number },
  candidates: { id: string; position: { x: number; y: number }; size: { width: number; height: number } }[], // 절대좌표로 이미 변환된 후보
  currentEdges: Edge[],
): { id: string; disconnect: boolean } | null {
  for (const n of candidates) {
    if (n.id === draggedId) continue
    const connected = currentEdges.some(e =>
      (e.source === draggedId && e.target === n.id) || (e.source === n.id && e.target === draggedId))
    if (!connected) continue
    const area = Math.min(draggedSize.width * draggedSize.height, n.size.width * n.size.height)
    const overlap = rectsOverlapArea(pos.x, pos.y, draggedSize.width, draggedSize.height, n.position.x, n.position.y, n.size.width, n.size.height)
    if (overlap / area >= DISCONNECT_OVERLAP_RATIO) return { id: n.id, disconnect: true }
  }
  for (const n of candidates) {
    if (n.id === draggedId) continue
    const connected = currentEdges.some(e =>
      (e.source === draggedId && e.target === n.id) || (e.source === n.id && e.target === draggedId))
    if (connected) continue
    const area = Math.min(draggedSize.width * draggedSize.height, n.size.width * n.size.height)
    const overlap = rectsOverlapArea(pos.x, pos.y, draggedSize.width, draggedSize.height, n.position.x, n.position.y, n.size.width, n.size.height)
    if (overlap / area >= CONNECT_OVERLAP_RATIO) return { id: n.id, disconnect: false }
  }
  return null
}

function nodeSize(n: Node): { width: number; height: number } {
  return {
    width: n.measured?.width ?? DEFAULT_WIDTH,
    height: n.measured?.height ?? DEFAULT_HEIGHT,
  }
}

// ── 뷰포트 저장 ────────────────────────────────────────────────────────────────
function viewportKey(boardId: string) { return `sketch_viewport_${boardId}` }

// ── Node 빌더 ──────────────────────────────────────────────────────────────────
function cardToNode(
  card: SketchCard,
  handlers: Omit<CardData, 'content' | 'color' | 'autoFocus'>,
  extraData?: { autoFocus?: boolean },
): CardNode {
  const node: CardNode = {
    id: card.id,
    type: 'sticky',
    position: { x: card.position_x, y: card.position_y },
    style: { width: card.width, height: card.height },
    data: { content: card.content, color: card.color as CategoryColorKey, ...handlers, ...extraData },
    zIndex: 10,
  }
  if (card.frame_id) {
    node.parentId = card.frame_id
    node.extent = 'parent'
  }
  return node
}

function frameToNode(frame: SketchFrame, handlers: Omit<FrameData, 'title' | 'collapsed' | 'frameWidth' | 'frameHeight'>): FrameNodeType {
  const h = frame.collapsed ? 1 : frame.height
  return {
    id: frame.id,
    type: 'frame',
    position: { x: frame.position_x, y: frame.position_y },
    style: { width: frame.width, height: h },
    data: {
      title: frame.title,
      collapsed: frame.collapsed,
      frameWidth: frame.width,
      frameHeight: frame.height,
      ...handlers,
    },
    zIndex: 0,
    selectable: true,
  }
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
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

  // 저장 실패 안내 — 위치/크기/색상/연결선 canonical write 실패 시 공통 표시(STEP D 패턴 재사용).
  // 텍스트 필드(카드 본문/프레임 제목)는 useAutosave가 이미 별도 안전망을 갖고 있어 대상 아님.
  const [saveError, setSaveError] = useState('')
  const SAVE_ERROR_MSG = '저장 실패 — 화면에는 반영됐지만 서버에 저장되지 않았을 수 있습니다. 새로고침 후 다시 확인해주세요.'
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [frames, setFrames] = useState<SketchFrame[]>([])
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null)
  const [hoverWillDisconnect, setHoverWillDisconnect] = useState(false)
  const hoverWillDisconnectRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [hoveringTrash, setHoveringTrash] = useState(false)
  const trashRef = useRef<HTMLDivElement>(null)
  const hoveringTrashRef = useRef(false)
  useEffect(() => { hoveringTrashRef.current = hoveringTrash }, [hoveringTrash])

  // 프레임 생성 모드
  const [isCreatingFrame, setIsCreatingFrame] = useState(false)
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const frameMouseStartRef = useRef<{ flowPos: { x: number; y: number }; clientPos: { x: number; y: number } } | null>(null)

  const nodesRef = useRef<Node[]>([])
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  const edgesRef = useRef<Edge[]>([])
  useEffect(() => { edgesRef.current = edges }, [edges])
  const framesRef = useRef<SketchFrame[]>([])
  useEffect(() => { framesRef.current = frames }, [frames])
  const hoverTargetIdRef = useRef<string | null>(null)
  const dragStartPositionRef = useRef<{ x: number; y: number } | null>(null)
  const pendingOriginRef = useRef<{ nodeId: string; origin: { x: number; y: number } } | null>(null)
  // restoreCard(undo/redo에서 카드를 되살릴 때 씀)가 cardHandlers를 직접 참조하면
  // cardHandlers(useMemo, 더 아래에서 선언)보다 먼저 오는 handleDelete 등의
  // 클로저에서 "선언 전 접근" 순환이 생긴다 — ref로 한 단계 끊어서 회피.
  const cardHandlersRef = useRef<Omit<CardData, 'content' | 'color' | 'autoFocus'> | null>(null)

  // ── Undo/Redo 히스토리 ─────────────────────────────────────────────────────
  // Ctrl+Z 대상: 카드 삭제, 카드 이동(프레임 진입/이탈 포함), 색상 변경, 연결/해제,
  // Tab 자식 생성. 텍스트 입력 자체는 건드리지 않는다 — contentEditable의 브라우저
  // 기본 undo가 이미 그 역할을 한다. 각 조작은 "핵심 반영"(apply*/*Cascade — DB
  // 반영 + 로컬 state 갱신만, 히스토리는 안 쌓음)과 "공개 핸들러"(사용자 액션에서
  // 호출, 핵심 반영을 실행한 뒤 pushHistory로 undo/redo 클로저 등록)로 나눈다.
  // undo/redo는 항상 핵심 반영 쪽을 직접 호출해서, 되돌리는 동작이 새 히스토리를
  // 또 쌓는 순환을 막는다.
  type HistoryEntry = { undo: () => void | Promise<unknown>; redo: () => void | Promise<unknown> }
  const historyRef = useRef<HistoryEntry[]>([])
  const redoStackRef = useRef<HistoryEntry[]>([])
  const MAX_HISTORY = 50

  function pushHistory(entry: HistoryEntry) {
    historyRef.current.push(entry)
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
    redoStackRef.current = []
  }

  async function runUndo() {
    const entry = historyRef.current.pop()
    if (!entry) return
    await entry.undo()
    redoStackRef.current.push(entry)
  }

  async function runRedo() {
    const entry = redoStackRef.current.pop()
    if (!entry) return
    await entry.redo()
    historyRef.current.push(entry)
  }

  function applyColorChange(id: string, color: CategoryColorKey) {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, color } } : n))
    supabase.from('sketch_cards').update({ color }).eq('id', id)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }

  async function applyEdgeAdd(edge: Edge) {
    setEdges(prev => [...prev, edge])
    const kind = (edge.data as { kind?: string } | undefined)?.kind
    const { error } = await supabase.from('sketch_edges')
      .insert({ id: edge.id, board_id: boardId, source_card_id: edge.source, target_card_id: edge.target, ...(kind ? { kind } : {}) })
    setSaveError(error ? SAVE_ERROR_MSG : '')
    if (error) setEdges(prev => prev.filter(e => e.id !== edge.id))
  }

  async function applyEdgeRemove(edge: Edge) {
    setEdges(prev => prev.filter(e => e.id !== edge.id))
    const { error } = await supabase.from('sketch_edges').delete().eq('id', edge.id)
    setSaveError(error ? SAVE_ERROR_MSG : '')
    if (error) setEdges(prev => [...prev, edge])
  }

  function applyCardPlacement(id: string, placement: { position: { x: number; y: number }; parentId: string | undefined }) {
    setNodes(prev => prev.map(n => n.id !== id ? n : {
      ...n, position: placement.position, parentId: placement.parentId,
      extent: placement.parentId ? ('parent' as const) : undefined,
    }))
    supabase.from('sketch_cards')
      .update({ position_x: placement.position.x, position_y: placement.position.y, frame_id: placement.parentId ?? null })
      .eq('id', id)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }

  // 드래그 시작 시점 위치/프레임 소속과 종료 후 위치/소속이 다를 때만 기록한다.
  function pushMoveHistory(
    id: string,
    before: { position: { x: number; y: number }; parentId: string | undefined },
    after: { position: { x: number; y: number }; parentId: string | undefined },
  ) {
    if (before.position.x === after.position.x && before.position.y === after.position.y && before.parentId === after.parentId) return
    pushHistory({ undo: () => applyCardPlacement(id, before), redo: () => applyCardPlacement(id, after) })
  }

  async function deleteCardCascade(id: string): Promise<{ card: SketchCard; edges: Edge[] } | null> {
    const relatedEdges = edgesRef.current.filter(e => e.source === id || e.target === id)
    const { data, error } = await supabase.from('sketch_cards').delete().eq('id', id).select().single()
    if (error || !data) return null
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id))
    return { card: data as SketchCard, edges: relatedEdges }
  }

  async function restoreCard(card: SketchCard, relatedEdges: Edge[]) {
    const { error } = await supabase.from('sketch_cards').insert({
      id: card.id, board_id: card.board_id, content: card.content, color: card.color,
      position_x: card.position_x, position_y: card.position_y,
      width: card.width, height: card.height, frame_id: card.frame_id,
    })
    if (error) { console.error('카드 복원 실패:', error.message); return }
    const handlers = cardHandlersRef.current
    if (!handlers) return
    setNodes(prev => [...prev, cardToNode(card, handlers)])
    if (relatedEdges.length === 0) return
    const rows = relatedEdges.map(e => ({
      id: e.id, board_id: boardId, source_card_id: e.source, target_card_id: e.target,
      ...((e.data as { kind?: string } | undefined)?.kind ? { kind: (e.data as { kind?: string }).kind } : {}),
    }))
    const { error: edgeError } = await supabase.from('sketch_edges').insert(rows)
    if (edgeError) { console.error('연결선 복원 실패:', edgeError.message); return }
    setEdges(prev => [...prev, ...relatedEdges])
  }

  // ── 카드 handlers ─────────────────────────────────────────────────────────
  const handleContentChange = useCallback((id: string, content: string) => {
    supabase.from('sketch_cards').update({ content }).eq('id', id)
      .then(({ error }) => { if (error) console.error('카드 내용 저장 실패:', error.message) })
  }, [])

  const handleColorChange = useCallback((id: string, color: CategoryColorKey) => {
    const prevColor = (nodesRef.current.find(n => n.id === id)?.data as { color?: CategoryColorKey } | undefined)?.color
    applyColorChange(id, color)
    if (prevColor && prevColor !== color) {
      pushHistory({ undo: () => applyColorChange(id, prevColor), redo: () => applyColorChange(id, color) })
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const result = await deleteCardCascade(id)
    if (!result) { alert('카드 삭제에 실패했습니다.'); return }
    pushHistory({ undo: () => restoreCard(result.card, result.edges), redo: () => deleteCardCascade(id) })
  }, [])

  const handleCardResize = useCallback((id: string, box: { x: number; y: number; width: number; height: number }) => {
    setNodes(prev => prev.map(n => n.id === id
      ? { ...n, position: { x: box.x, y: box.y }, style: { ...n.style, width: box.width, height: box.height } }
      : n))
    supabase.from('sketch_cards')
      .update({ position_x: box.x, position_y: box.y, width: box.width, height: box.height })
      .eq('id', id)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }, [])

  const cardHandlers = useMemo(() => ({
    onContentChange: handleContentChange,
    onColorChange: handleColorChange,
    onDelete: handleDelete,
    onResize: handleCardResize,
    supabase,
  }), [handleContentChange, handleColorChange, handleDelete, handleCardResize, supabase])
  useEffect(() => { cardHandlersRef.current = cardHandlers }, [cardHandlers])

  // ── 프레임 handlers ───────────────────────────────────────────────────────
  const handleFrameTitleChange = useCallback((frameId: string, title: string) => {
    setFrames(prev => prev.map(f => f.id === frameId ? { ...f, title } : f))
    setNodes(prev => prev.map(n => n.id === frameId ? { ...n, data: { ...n.data, title } } : n))
    supabase.from('sketch_frames').update({ title }).eq('id', frameId)
      .then(({ error }) => { if (error) console.error('프레임 제목 저장 실패:', error.message) })
  }, [])

  const handleFrameCollapseToggle = useCallback((frameId: string) => {
    const frame = framesRef.current.find(f => f.id === frameId)
    if (!frame) return
    const next = !frame.collapsed
    setFrames(prev => prev.map(f => f.id === frameId ? { ...f, collapsed: next } : f))
    setNodes(prev => prev.map(n => {
      if (n.id === frameId) return { ...n, style: { ...n.style, height: next ? 1 : frame.height }, data: { ...n.data, collapsed: next } }
      if (n.parentId === frameId) return { ...n, hidden: next }
      return n
    }))
    supabase.from('sketch_frames').update({ collapsed: next }).eq('id', frameId)
      .then(({ error }) => {
        if (error) {
          setFrames(prev => prev.map(f => f.id === frameId ? { ...f, collapsed: !next } : f))
          setNodes(prev => prev.map(n => {
            if (n.id === frameId) return { ...n, style: { ...n.style, height: !next ? 1 : frame.height }, data: { ...n.data, collapsed: !next } }
            if (n.parentId === frameId) return { ...n, hidden: !next }
            return n
          }))
          alert('접기/펼치기에 실패했습니다.')
        }
      })
  }, [])

  const handleFrameDelete = useCallback(async (frameId: string) => {
    // 자식 카드들을 자유 카드로 전환 (절대좌표 복원)
    const frame = framesRef.current.find(f => f.id === frameId)
    const children = nodesRef.current.filter(n => n.parentId === frameId)
    if (frame && children.length > 0) {
      setNodes(prev => prev.map(n => {
        if (n.parentId !== frameId) return n
        return { ...n, parentId: undefined, extent: undefined, position: { x: frame.position_x + n.position.x, y: frame.position_y + n.position.y } }
      }))
      await Promise.all(children.map(c =>
        supabase.from('sketch_cards').update({
          frame_id: null,
          position_x: frame.position_x + c.position.x,
          position_y: frame.position_y + c.position.y,
        }).eq('id', c.id).then(({ error }) => {
          if (error) console.error('카드 frame_id 해제 실패:', error.message)
        })
      ))
    }
    const { error } = await supabase.from('sketch_frames').delete().eq('id', frameId)
    if (error) { alert('프레임 삭제에 실패했습니다.'); return }
    setFrames(prev => prev.filter(f => f.id !== frameId))
    setNodes(prev => prev.filter(n => n.id !== frameId))
  }, [])

  // NodeResizer가 크기 조절이 끝났을 때 한 번만 호출 — 드래그 중 실시간 위치/크기는
  // React Flow 자체 changes 파이프라인이 처리하므로 여기선 최종값만 우리 상태(frames)와
  // DB에 반영하면 된다. data.frameWidth/frameHeight는 FrameNode의 라벨 최대폭 계산에
  // 쓰이는 별도 사본이라 함께 갱신해줘야 함.
  const handleFrameResize = useCallback((frameId: string, box: { x: number; y: number; width: number; height: number }) => {
    setFrames(prev => prev.map(f => f.id === frameId
      ? { ...f, position_x: box.x, position_y: box.y, width: box.width, height: box.height }
      : f))
    setNodes(prev => prev.map(n => n.id === frameId
      ? { ...n, data: { ...n.data, frameWidth: box.width, frameHeight: box.height } }
      : n))
    supabase.from('sketch_frames')
      .update({ position_x: box.x, position_y: box.y, width: box.width, height: box.height })
      .eq('id', frameId)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }, [])

  const frameHandlers = useMemo(() => ({
    onTitleChange: handleFrameTitleChange,
    onCollapseToggle: handleFrameCollapseToggle,
    onDelete: handleFrameDelete,
    onResize: handleFrameResize,
    supabase,
  }), [handleFrameTitleChange, handleFrameCollapseToggle, handleFrameDelete, handleFrameResize, supabase])

  // ── 카드↔프레임 소속 관리 ─────────────────────────────────────────────────
  const addCardToFrame = useCallback((cardId: string, frame: SketchFrame, absPos: { x: number; y: number }) => {
    const relX = absPos.x - frame.position_x
    const relY = absPos.y - frame.position_y
    setNodes(prev => prev.map(n => n.id !== cardId ? n : { ...n, parentId: frame.id, extent: 'parent' as const, position: { x: relX, y: relY } }))
    supabase.from('sketch_cards').update({ frame_id: frame.id, position_x: relX, position_y: relY }).eq('id', cardId)
      .then(({ error }) => {
        setSaveError(error ? SAVE_ERROR_MSG : '')
        if (error) {
          setNodes(prev => prev.map(n => n.id !== cardId ? n : { ...n, parentId: undefined, extent: undefined, position: absPos }))
        }
      })
  }, [])

  const removeCardFromFrame = useCallback((cardId: string, absPos: { x: number; y: number }) => {
    setNodes(prev => prev.map(n => n.id !== cardId ? n : { ...n, parentId: undefined, extent: undefined, position: absPos }))
    supabase.from('sketch_cards').update({ frame_id: null, position_x: absPos.x, position_y: absPos.y }).eq('id', cardId)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }, [])

  // ── 위치/연결 ─────────────────────────────────────────────────────────────
  const savePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    supabase.from('sketch_cards').update({ position_x: position.x, position_y: position.y }).eq('id', nodeId)
      .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
  }, [])

  // kind: Tab으로 만든 부모→자식 엣지는 'hierarchy'로 표시, 드래그로 만든 수동
  // 연결(기존 호출부)은 kind를 안 넘겨 null로 남는다 — 지금은 스타일 차이를 두지
  // 않지만(edgeFromRow가 data.kind로 그대로 실어 보냄), 나중에 위계 연결만 다르게
  // 그리고 싶을 때 이 값으로 바로 필터링할 수 있다.
  // 반환된 Edge는 호출부(onConnect/드래그 연결/Tab)가 각자의 되돌리기 히스토리를
  // 등록하는 데 쓴다 — 이 함수 자체는 히스토리를 쌓지 않는다(Tab은 카드+연결을
  // 하나의 되돌리기 단위로 묶어야 해서, 여기서 개별로 쌓으면 안 됨).
  const handleConnect = useCallback(async (sourceId: string, targetId: string, kind?: string): Promise<Edge | null> => {
    // kind가 없는 기존 수동 연결 호출부는 payload에 kind 키 자체를 안 넣는다 —
    // supabase/schema_v44.sql(kind 컬럼 추가) 적용 전에도 기존 드래그 연결이
    // 깨지지 않도록. Tab 쪽만 새로 kind:'hierarchy'를 명시적으로 넘긴다.
    const { data, error } = await supabase.from('sketch_edges')
      .insert({ board_id: boardId, source_card_id: sourceId, target_card_id: targetId, ...(kind ? { kind } : {}) })
      .select().single()
    setSaveError(error || !data ? SAVE_ERROR_MSG : '')
    if (error || !data) return null
    const edge = edgeFromRow(data as SketchEdge)
    setEdges(eds => [...eds, edge])
    return edge
  }, [boardId])

  const handleDisconnect = useCallback((edge: Edge) => {
    applyEdgeRemove(edge)
    pushHistory({ undo: () => applyEdgeAdd(edge), redo: () => applyEdgeRemove(edge) })
  }, [])

  const handleEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach(edge => handleDisconnect(edge))
  }, [handleDisconnect])

  // Backspace/Delete 키(deleteKeyCode)로 지운 카드는 React Flow가 로컬 state에서만
  // 제거하고 끝나버려 canonical DB delete가 전혀 호출되지 않았던 버그 수정 —
  // 이 콜백이 트래시 아이콘/드래그-투-트래시와 동일한 handleDelete(캐논니컬 삭제 +
  // 에러 체크)를 태워준다. 프레임(type: 'frame')은 자식 카드 reparenting이 필요해
  // handleFrameDelete가 따로 처리하므로 여기서는 제외.
  const handleNodesDelete = useCallback((deleted: Node[]) => {
    deleted.filter(n => n.type === 'sticky').forEach(n => handleDelete(n.id))
  }, [handleDelete])

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    handleConnect(connection.source, connection.target).then(edge => {
      if (edge) pushHistory({ undo: () => applyEdgeRemove(edge), redo: () => applyEdgeAdd(edge) })
    })
  }, [handleConnect])

  // ── customOnNodesChange (진단 + intercept) ────────────────────────────────
  const customOnNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    const hasPositionEnd = changes.some(c => c.type === 'position' && (c as { dragging?: boolean }).dragging === false)
    if (hasPositionEnd && pendingOriginRef.current) {
      const { nodeId, origin } = pendingOriginRef.current
      let intercepted = false
      const patched = changes.map(c => {
        if (c.type === 'position' && c.id === nodeId && (c as { dragging?: boolean }).dragging === false) {
          intercepted = true
          return { ...c, position: origin, positionAbsolute: origin }
        }
        return c
      })
      if (intercepted) pendingOriginRef.current = null
      onNodesChange(patched)
      return
    }
    onNodesChange(changes)
  }, [onNodesChange])

  // ── 데이터 로딩 ───────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('sketch_boards').select('*').eq('id', boardId).single(),
      supabase.from('sketch_cards').select('*').eq('board_id', boardId).order('created_at'),
      supabase.from('sketch_edges').select('*').eq('board_id', boardId),
      supabase.from('sketch_frames').select('*').eq('board_id', boardId),
    ]).then(([boardRes, cardsRes, edgesRes, framesRes]) => {
      if (boardRes.data) { setBoard(boardRes.data as SketchBoard); setNameInput(boardRes.data.name) }
      const loadedFrames = (framesRes.data ?? []) as SketchFrame[]
      setFrames(loadedFrames)
      const cards = (cardsRes.data ?? []) as SketchCard[]
      const frameNodes = loadedFrames.map(f => frameToNode(f, frameHandlers))
      const cardNodes = cards.map(c => cardToNode(c, cardHandlers))
      // 프레임 노드를 앞에 두어 카드 아래에 렌더링
      setNodes([...frameNodes, ...cardNodes])
      setEdges(((edgesRes.data ?? []) as SketchEdge[]).map(edgeFromRow))
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId])

  // ── 카드 생성 ─────────────────────────────────────────────────────────────
  async function createCard(x: number, y: number) {
    const color = COLOR_KEYS[nodes.filter(n => n.type === 'sticky').length % COLOR_KEYS.length]
    const position_x = x - DEFAULT_WIDTH / 2
    const position_y = y - DEFAULT_HEIGHT / 2
    const { data, error } = await supabase.from('sketch_cards')
      .insert({ board_id: boardId, content: '', color, position_x, position_y, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })
      .select().single()
    if (error || !data) { console.error('카드 생성 실패:', error?.message); return }
    setNodes(prev => [...prev, cardToNode(data as SketchCard, cardHandlers)])
  }

  // ── Tab: 선택된 카드 아래에 자식 카드 생성 ──────────────────────────────────
  // 새 자식은 부모의 기존 hierarchy 자식(Tab으로 만든 자식만, edge.kind==='hierarchy')
  // 중 가장 오른쪽 카드 옆에 배치한다. 기존 카드는 위치를 절대 건드리지 않음 —
  // 예전엔 parent.id를 source로 하는 엣지를 전부 "형제"로 취급해 부모 중심축
  // 기준 한 줄로 강제 재배치했는데, 그 대상에 수동으로 드래그 연결해둔 카드나
  // 사용자가 직접 다른 자리로 옮겨둔 기존 자식까지 포함돼 있어 Tab 한 번에
  // 엉뚱한(이미 다른 자리에 있던) 카드가 자식 줄로 끌려 내려오는 버그가 있었다.
  async function handleTabCreateChild(parent: Node) {
    const parentAbs = toAbsolutePosition(parent.position, parent.parentId, framesRef.current)
    const parentSize = nodeSize(parent)
    const childY = parentAbs.y + parentSize.height + CHILD_V_GAP

    const siblingIds = edgesRef.current
      .filter(e => e.source === parent.id && (e.data as { kind?: string } | undefined)?.kind === 'hierarchy')
      .map(e => e.target)
    const siblings = siblingIds
      .map(id => nodesRef.current.find(n => n.id === id && n.type === 'sticky'))
      .filter((n): n is Node => !!n)

    const newChildAbsX = siblings.length === 0
      ? parentAbs.x + parentSize.width / 2 - DEFAULT_WIDTH / 2
      : Math.max(...siblings.map(s => toAbsolutePosition(s.position, s.parentId, framesRef.current).x + nodeSize(s).width)) + CHILD_H_GAP

    const color = COLOR_KEYS[nodesRef.current.filter(n => n.type === 'sticky').length % COLOR_KEYS.length]
    const { data, error } = await supabase.from('sketch_cards')
      .insert({
        board_id: boardId, content: '', color,
        position_x: newChildAbsX, position_y: childY,
        width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
      })
      .select().single()
    if (error || !data) { console.error('자식 카드 생성 실패:', error?.message); return }
    const newCard = data as SketchCard

    setNodes(prev => [...prev, cardToNode(newCard, cardHandlers, { autoFocus: true })])

    // 선택 상태는 raw setNodes로 node.selected를 직접 대입하지 않고 React Flow의
    // 정식 change 파이프라인(onNodesChange 'select')으로 보낸다 — 직접 대입하면
    // z-index/visibility 같은 파생 스타일이 다음 클릭 전까지 정리되지 않고 남아있어
    // (선택은 됐지만 elevated z-index + visibility:hidden에 갇힘) 방금 만든 카드로
    // 옮긴 focus()가 조용히 실패하는 문제가 있었다.
    const previouslySelectedIds = nodesRef.current.filter(n => n.selected).map(n => n.id)
    onNodesChange([
      ...previouslySelectedIds.map(nid => ({ type: 'select' as const, id: nid, selected: false })),
      { type: 'select' as const, id: newCard.id, selected: true },
    ])

    const edge = await handleConnect(parent.id, newCard.id, 'hierarchy')
    // 카드 생성 + 연결을 하나의 되돌리기 단위로 묶는다 — undo는 새 카드를(연결도
    // cascade로 함께) 지우고, redo는 같은 id로 카드+연결을 다시 만든다.
    pushHistory({
      undo: () => deleteCardCascade(newCard.id),
      redo: () => restoreCard(newCard, edge ? [edge] : []),
    })
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

  const handleTabCreateChildRef = useRef(handleTabCreateChild)
  useEffect(() => { handleTabCreateChildRef.current = handleTabCreateChild })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl/Cmd+Z(되돌리기), Ctrl/Cmd+Shift+Z 또는 Ctrl+Y(다시하기) — 텍스트
      // 편집 중(contenteditable/input)에는 브라우저 기본 undo/redo에 맡기고 여기서
      // 가로채지 않는다.
      const key = e.key.toLowerCase()
      const isUndoKey = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === 'z'
      const isRedoKey = (e.ctrlKey || e.metaKey) && !e.altKey && ((e.shiftKey && key === 'z') || (!e.shiftKey && key === 'y'))
      if (isUndoKey || isRedoKey) {
        const editTarget = e.target as HTMLElement | null
        const editTag = editTarget?.tagName.toLowerCase()
        const inEditable = (!!editTag && ['input', 'textarea', 'select'].includes(editTag))
          || editTarget?.getAttribute('contenteditable') === 'true'
        if (inEditable) return
        e.preventDefault()
        if (isRedoKey) void runRedo()
        else void runUndo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return
      if (target.getAttribute('contenteditable') === 'true') return
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); handleAddButtonClickRef.current() }
      if (e.key.toLowerCase() === 'f') { e.preventDefault(); setIsCreatingFrame(v => !v) }
      if (e.key === 'Escape') setIsCreatingFrame(false)
      if (e.key === 'Tab') {
        // 편집모드(contenteditable/input)는 위에서 이미 걸러졌으므로 여기 도달했다는
        // 건 "선택된 상태(비편집)"라는 뜻 — 정확히 카드 1개가 선택돼 있을 때만 자식을
        // 만든다(0개=아무 의미 없음, 2개 이상=어느 카드 밑에 만들지 모호해서 무시).
        const selected = nodesRef.current.filter(n => n.type === 'sticky' && n.selected)
        if (selected.length === 1) { e.preventDefault(); void handleTabCreateChildRef.current(selected[0]) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── 프레임 생성 (드래그 선택 → 프레임) ────────────────────────────────────
  function handleFrameOverlayMouseDown(e: React.MouseEvent) {
    const containerRect = wrapperRef.current?.getBoundingClientRect()
    if (!containerRect) return
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const clientPos = { x: e.clientX - containerRect.left, y: e.clientY - containerRect.top }
    frameMouseStartRef.current = { flowPos, clientPos }
    setSelectionRect({ left: clientPos.x, top: clientPos.y, width: 0, height: 0 })
  }

  function handleFrameOverlayMouseMove(e: React.MouseEvent) {
    if (!frameMouseStartRef.current) return
    const containerRect = wrapperRef.current?.getBoundingClientRect()
    if (!containerRect) return
    const cur = { x: e.clientX - containerRect.left, y: e.clientY - containerRect.top }
    const start = frameMouseStartRef.current.clientPos
    setSelectionRect({
      left: Math.min(start.x, cur.x),
      top: Math.min(start.y, cur.y),
      width: Math.abs(cur.x - start.x),
      height: Math.abs(cur.y - start.y),
    })
  }

  function handleFrameOverlayMouseUp(e: React.MouseEvent) {
    if (!frameMouseStartRef.current) return
    const flowEnd = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const flowStart = frameMouseStartRef.current.flowPos
    frameMouseStartRef.current = null
    setSelectionRect(null)
    setIsCreatingFrame(false)

    const rawX = Math.min(flowStart.x, flowEnd.x)
    const rawY = Math.min(flowStart.y, flowEnd.y)
    const rawW = Math.abs(flowEnd.x - flowStart.x)
    const rawH = Math.abs(flowEnd.y - flowStart.y)
    if (rawW < 40 || rawH < 40) return

    // 선택 영역 안에 있는 자유 카드 찾기
    const selectedCards = nodesRef.current.filter(n => {
      if (n.type !== 'sticky' || n.parentId) return false
      return rectsOverlapArea(rawX, rawY, rawW, rawH, n.position.x, n.position.y, DEFAULT_WIDTH, DEFAULT_HEIGHT) > 0
    })

    // 프레임 bounding box 계산
    let frameX: number, frameY: number, frameW: number, frameH: number
    if (selectedCards.length > 0) {
      const minX = Math.min(...selectedCards.map(n => n.position.x)) - FRAME_PADDING
      const minY = Math.min(...selectedCards.map(n => n.position.y)) - FRAME_PADDING - FRAME_LABEL_SPACE
      const maxX = Math.max(...selectedCards.map(n => n.position.x + DEFAULT_WIDTH)) + FRAME_PADDING
      const maxY = Math.max(...selectedCards.map(n => n.position.y + DEFAULT_HEIGHT)) + FRAME_PADDING
      frameX = minX; frameY = minY; frameW = maxX - minX; frameH = maxY - minY
    } else {
      frameX = rawX - FRAME_PADDING; frameY = rawY - FRAME_PADDING - FRAME_LABEL_SPACE
      frameW = rawW + FRAME_PADDING * 2; frameH = rawH + FRAME_PADDING * 2 + FRAME_LABEL_SPACE
    }

    doCreateFrame(frameX, frameY, frameW, frameH, selectedCards)
  }

  async function doCreateFrame(
    frameX: number, frameY: number, frameW: number, frameH: number, selectedCards: Node[]
  ) {
    const { data: fData, error: fErr } = await supabase.from('sketch_frames')
      .insert({ board_id: boardId, title: '제목 없는 프레임', position_x: frameX, position_y: frameY, width: frameW, height: frameH })
      .select().single()
    if (fErr || !fData) { alert('프레임 생성에 실패했습니다.'); return }
    const frame = fData as SketchFrame
    setFrames(prev => [...prev, frame])

    // 선택된 카드들을 프레임 자식으로 전환
    const updatedCards: Node[] = []
    for (const cardNode of selectedCards) {
      const relX = cardNode.position.x - frameX
      const relY = cardNode.position.y - frameY
      const { error } = await supabase.from('sketch_cards')
        .update({ frame_id: frame.id, position_x: relX, position_y: relY })
        .eq('id', cardNode.id)
      if (error) { console.error('카드 frame_id 설정 실패:', error.message); continue }
      updatedCards.push({ ...cardNode, parentId: frame.id, extent: 'parent' as const, position: { x: relX, y: relY } })
    }

    const newFrameNode = frameToNode(frame, frameHandlers)
    const updatedIds = new Set(updatedCards.map(n => n.id))
    setNodes(prev => {
      const rest = prev.map(n => updatedIds.has(n.id) ? (updatedCards.find(u => u.id === n.id) ?? n) : n)
      // 프레임 노드는 맨 앞 (카드보다 낮은 zIndex)
      const frames = rest.filter(n => n.type === 'frame')
      const cards = rest.filter(n => n.type !== 'frame')
      return [newFrameNode, ...frames, ...cards]
    })
  }

  // ── Drag helpers ──────────────────────────────────────────────────────────
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

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleNodeDragStart: OnNodeDrag<Node> = useCallback((_e, node) => {
    if (node.type === 'frame') return
    setIsDragging(true)
    dragStartPositionRef.current = { x: node.position.x, y: node.position.y }
  }, [])

  const handleNodeDrag: OnNodeDrag<Node> = useCallback((e, node) => {
    if (node.type === 'frame') return
    const overTrash = isOverTrash(e as unknown as MouseEvent)
    if (overTrash !== hoveringTrashRef.current) setHoveringTrash(overTrash)
    if (overTrash) {
      if (hoverTargetIdRef.current !== null) { hoverTargetIdRef.current = null; hoverWillDisconnectRef.current = false; setHoverTargetId(null) }
      return
    }
    // 프레임 소속 여부와 무관하게 절대좌표로 변환해서 비교 (같은 프레임 안의
    // 카드끼리도, 자유 카드끼리도 겹침으로 연결/해제가 가능해야 함)
    const draggedAbsPos = toAbsolutePosition(node.position, node.parentId, framesRef.current)
    const candidates = (nodesRef.current.filter(n => n.type === 'sticky' && n.id !== node.id) as CardNode[])
      .map(n => ({ id: n.id, position: toAbsolutePosition(n.position, n.parentId, framesRef.current), size: nodeSize(n) }))
    const overlap = detectOverlap(node.id, draggedAbsPos, nodeSize(node), candidates, edgesRef.current)
    const newId = overlap?.id ?? null
    const newDisconnect = overlap?.disconnect ?? false
    hoverTargetIdRef.current = newId
    hoverWillDisconnectRef.current = newDisconnect
    if (newId !== hoverTargetId) setHoverTargetId(newId)
    if (newDisconnect !== hoverWillDisconnect) setHoverWillDisconnect(newDisconnect)
  }, [hoverTargetId, hoverWillDisconnect])

  const handleNodeDragStop: OnNodeDrag<Node> = useCallback((_e, node) => {
    // ── 프레임 드래그: 위치만 저장 ──────────────────────────────────────────
    if (node.type === 'frame') {
      const f = framesRef.current.find(fr => fr.id === node.id)
      if (!f) return
      setFrames(prev => prev.map(fr => fr.id === node.id ? { ...fr, position_x: node.position.x, position_y: node.position.y } : fr))
      supabase.from('sketch_frames').update({ position_x: node.position.x, position_y: node.position.y }).eq('id', node.id)
        .then(({ error }) => { setSaveError(error ? SAVE_ERROR_MSG : '') })
      return
    }

    // ── 카드 드래그 공통 정리 ─────────────────────────────────────────────
    setIsDragging(false)
    hoverTargetIdRef.current = null
    hoverWillDisconnectRef.current = false
    setHoverTargetId(null)

    if (hoveringTrashRef.current) { setHoveringTrash(false); handleDelete(node.id); return }

    // ── connect / disconnect: 프레임 소속 여부와 무관하게 절대좌표로 판정 ──────
    // (같은 프레임 안의 카드끼리도 겹쳐서 연결/해제할 수 있어야 함)
    const draggedAbsPos = toAbsolutePosition(node.position, node.parentId, framesRef.current)
    const candidates = (nodesRef.current.filter(n => n.type === 'sticky' && n.id !== node.id) as CardNode[])
      .map(n => ({ id: n.id, position: toAbsolutePosition(n.position, n.parentId, framesRef.current), size: nodeSize(n) }))
    const overlap = detectOverlap(node.id, draggedAbsPos, nodeSize(node), candidates, edgesRef.current)

    if (overlap && !overlap.disconnect) {
      const origin = dragStartPositionRef.current
      const capturedId = node.id
      if (origin) {
        pendingOriginRef.current = { nodeId: capturedId, origin }
        savePosition(capturedId, origin)
        setTimeout(() => {
          setNodes(nds => nds.map(n => n.id === capturedId ? { ...n, position: origin } : n))
          pendingOriginRef.current = null
        }, 0)
      }
      // 드래그로 이동한 위치는 원위치로 되돌아가고 연결만 남으므로, 되돌리기
      // 대상은 위치가 아니라 방금 생긴 연결선 하나뿐이다.
      handleConnect(capturedId, overlap.id).then(edge => {
        if (edge) pushHistory({ undo: () => applyEdgeRemove(edge), redo: () => applyEdgeAdd(edge) })
      })
      return
    }

    if (overlap?.disconnect) {
      const origin = dragStartPositionRef.current
      const capturedId = node.id
      const existing = edgesRef.current.find(e =>
        (e.source === capturedId && e.target === overlap.id) || (e.source === overlap.id && e.target === capturedId))
      if (existing) handleDisconnect(existing) // handleDisconnect가 자체적으로 되돌리기 히스토리를 쌓는다
      if (origin) {
        savePosition(capturedId, origin)
        setTimeout(() => {
          setNodes(nds => nds.map(n => n.id === capturedId ? { ...n, position: origin } : n))
        }, 0)
      } else {
        savePosition(node.id, node.position)
      }
      return
    }

    // ── 프레임 소속 카드: 프레임 이탈 여부 확인 ──────────────────────────
    if (node.parentId) {
      const frame = framesRef.current.find(f => f.id === node.parentId)
      if (!frame) return
      const beforePos = dragStartPositionRef.current ?? node.position
      // node.position 은 프레임 상대좌표
      const cardCenterX = node.position.x + DEFAULT_WIDTH / 2
      const cardCenterY = node.position.y + DEFAULT_HEIGHT / 2
      const isOutside = cardCenterX < 0 || cardCenterX > frame.width || cardCenterY < 0 || cardCenterY > frame.height
      if (isOutside) {
        const absPos = { x: frame.position_x + node.position.x, y: frame.position_y + node.position.y }
        pushMoveHistory(node.id, { position: beforePos, parentId: node.parentId }, { position: absPos, parentId: undefined })
        removeCardFromFrame(node.id, absPos)
      } else {
        pushMoveHistory(node.id, { position: beforePos, parentId: node.parentId }, { position: node.position, parentId: node.parentId })
        savePosition(node.id, node.position)
      }
      return
    }

    // ── 자유 카드: 프레임 진입 여부 확인 ──────────────────────────────────
    const targetFrame = framesRef.current.find(frame => {
      if (frame.collapsed) return false
      const relX = node.position.x - frame.position_x
      const relY = node.position.y - frame.position_y
      const centerX = relX + DEFAULT_WIDTH / 2
      const centerY = relY + DEFAULT_HEIGHT / 2
      return centerX > 0 && centerX < frame.width && centerY > 0 && centerY < frame.height
    })
    if (targetFrame) {
      const beforePos = dragStartPositionRef.current ?? node.position
      const relPos = { x: node.position.x - targetFrame.position_x, y: node.position.y - targetFrame.position_y }
      pushMoveHistory(node.id, { position: beforePos, parentId: undefined }, { position: relPos, parentId: targetFrame.id })
      addCardToFrame(node.id, targetFrame, node.position)
      return
    }

    {
      const beforePos = dragStartPositionRef.current ?? node.position
      pushMoveHistory(node.id, { position: beforePos, parentId: undefined }, { position: node.position, parentId: undefined })
    }
    savePosition(node.id, node.position)
  }, [savePosition, handleConnect, handleDisconnect, handleDelete, addCardToFrame, removeCardFromFrame, setNodes])

  // ── nodeTypes ─────────────────────────────────────────────────────────────
  const nodeTypes: NodeTypes = useMemo(() => ({
    sticky: StickyCardNode,
    frame: FrameNodeComponent,
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

  const cardCount = nodes.filter(n => n.type === 'sticky').length

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
        <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(226,232,240,0.3)' }}>카드 {cardCount}개</span>

        {/* 프레임 생성 버튼 */}
        <button
          onClick={() => setIsCreatingFrame(v => !v)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-colors flex-shrink-0"
          style={{
            background: isCreatingFrame ? 'rgba(76,127,224,0.35)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${isCreatingFrame ? 'rgba(76,127,224,0.6)' : 'rgba(255,255,255,0.1)'}`,
            color: isCreatingFrame ? '#9DBEF5' : 'rgba(226,232,240,0.5)',
          }}
          title="프레임 생성 모드 (F)"
        >
          <Frame size={13} /> 프레임
          <span className="text-[10px] font-mono opacity-50">F</span>
        </button>

        <button
          onClick={handleAddButtonClick}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-colors flex-shrink-0"
          style={{ background: 'rgba(76,127,224,0.18)', border: '1px solid rgba(76,127,224,0.35)', color: '#9DBEF5' }}
        >
          <Plus size={13} /> 새 카드
          <span className="text-[10px] font-mono opacity-50">N</span>
        </button>
      </div>

      {/* 저장 실패 안내 — 위치/크기/색상/연결선 canonical write 실패 시 표시 */}
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
        onDoubleClick={!isCreatingFrame ? handlePaneDoubleClick : undefined}
      >
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
            onNodesDelete={handleNodesDelete}
            deleteKeyCode={['Backspace', 'Delete']}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onMoveEnd={handleMoveEnd}
            panOnDrag={!isCreatingFrame}
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
              nodeColor={n => CATEGORY_PALETTE[(n.data as CardData)?.color]?.solid ?? '#6B9BE0'}
            />
          </ReactFlow>
        )}

        {/* 프레임 생성 오버레이 */}
        {isCreatingFrame && (
          <div
            className="absolute inset-0"
            style={{ cursor: 'crosshair', zIndex: 50 }}
            onMouseDown={handleFrameOverlayMouseDown}
            onMouseMove={handleFrameOverlayMouseMove}
            onMouseUp={handleFrameOverlayMouseUp}
          />
        )}
        {selectionRect && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: selectionRect.left, top: selectionRect.top,
              width: selectionRect.width, height: selectionRect.height,
              border: '1.5px dashed rgba(76,127,224,0.7)',
              background: 'rgba(76,127,224,0.08)',
              borderRadius: 8, zIndex: 51,
            }}
          />
        )}

        {/* 드래그 중 휴지통 */}
        {isDragging && (
          <div ref={trashRef}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center rounded-full transition-all"
            style={{
              width: hoveringTrash ? 56 : 46, height: hoveringTrash ? 56 : 46,
              background: hoveringTrash ? 'rgba(248,113,113,0.9)' : 'rgba(22,27,36,0.9)',
              border: `1px solid ${hoveringTrash ? 'rgba(248,113,113,1)' : 'rgba(255,255,255,0.15)'}`,
              boxShadow: hoveringTrash ? '0 0 24px rgba(248,113,113,0.5)' : '0 4px 12px rgba(0,0,0,0.3)',
            }}>
            <Trash2 size={hoveringTrash ? 22 : 18} color={hoveringTrash ? '#fff' : 'rgba(226,232,240,0.6)'} />
          </div>
        )}
      </div>

      <p className="text-center text-[11px] pt-2 flex-shrink-0" style={{ color: 'rgba(226,232,240,0.28)' }}>
        {isCreatingFrame
          ? <>드래그해서 프레임 영역을 그리세요 · <span className="font-mono">Esc</span>로 취소</>
          : cardCount === 0
            ? <>더블클릭 또는 <span className="font-mono">N</span> 키로 카드를 만드세요</>
            : <>카드 왼쪽은 이동, 오른쪽은 바로 입력 · 겹쳐 놓으면 연결 · <span className="font-mono">F</span>로 프레임 생성</>}
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
