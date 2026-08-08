'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2, X, Plus, ArrowRight, ArrowLeft } from 'lucide-react'
import { CATEGORY_PALETTE, type CategoryColorKey } from '@/lib/categoryColors'
import type { Edge } from '@xyflow/react'
import type { CardNode } from './SketchCanvas'

const COLOR_KEYS = Object.keys(CATEGORY_PALETTE) as CategoryColorKey[]

function previewOf(content: string) {
  const trimmed = content.trim()
  if (!trimmed) return '(빈 카드)'
  return trimmed.length > 36 ? trimmed.slice(0, 36) + '…' : trimmed
}

interface SketchCardModalProps {
  card: CardNode
  allCards: CardNode[]
  connectedEdges: Edge[]
  onContentChange: (id: string, content: string) => void
  onColorChange: (id: string, color: CategoryColorKey) => void
  onDelete: (id: string) => void
  onAddConnection: (targetId: string) => void
  onRemoveConnection: (edgeId: string) => void
  onClose: () => void
}

export default function SketchCardModal({
  card, allCards, connectedEdges,
  onContentChange, onColorChange, onDelete, onAddConnection, onRemoveConnection, onClose,
}: SketchCardModalProps) {
  const [text, setText] = useState(card.data.content)
  const [color, setColor] = useState(card.data.color)
  const [pickerOpen, setPickerOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingRef = useRef<string | null>(null)
  const palette = CATEGORY_PALETTE[color]

  useEffect(() => {
    return () => { if (pendingRef.current !== null) onContentChange(card.id, pendingRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleTextChange(value: string) {
    setText(value)
    pendingRef.current = value
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { onContentChange(card.id, value); pendingRef.current = null }, 500)
  }

  function handleColorClick(key: CategoryColorKey) {
    setColor(key)
    onColorChange(card.id, key)
  }

  function handleDeleteClick() {
    if (!confirm('카드를 삭제하시겠습니까?')) return
    onDelete(card.id)
  }

  const connectedIds = new Set(connectedEdges.map(e => (e.source === card.id ? e.target : e.source)))
  const connectable = allCards.filter(c => !connectedIds.has(c.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-3xl p-5 w-full max-w-md flex flex-col gap-4"
        style={{ background: 'rgba(30,32,40,0.97)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}>

        {/* 색상 + 삭제 + 닫기 */}
        <div className="flex items-center gap-1.5">
          {COLOR_KEYS.map(key => (
            <button key={key} onClick={() => handleColorClick(key)}
              className="w-4 h-4 rounded-full transition-transform hover:scale-125 flex-shrink-0"
              style={{ background: CATEGORY_PALETTE[key].solid, outline: key === color ? `2px solid ${CATEGORY_PALETTE[key].text}` : 'none', outlineOffset: 2 }} />
          ))}
          <button onClick={handleDeleteClick} className="ml-auto text-white/40 hover:text-red-400 transition-colors flex-shrink-0">
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* 내용 */}
        <textarea
          autoFocus
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          placeholder="생각을 적어보세요…"
          className="w-full text-[14px] leading-relaxed bg-transparent focus:outline-none resize-none placeholder:text-white/25 rounded-xl p-3"
          style={{ color: palette.text, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', minHeight: 160 }}
        />

        {/* 연결된 카드 */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium" style={{ color: 'rgba(226,232,240,0.4)' }}>연결된 카드</p>

          {connectedEdges.length === 0 && (
            <p className="text-[12px]" style={{ color: 'rgba(226,232,240,0.28)' }}>아직 연결된 카드가 없습니다</p>
          )}

          {connectedEdges.map(edge => {
            const otherId = edge.source === card.id ? edge.target : edge.source
            const other = allCards.find(c => c.id === otherId)
            const outgoing = edge.source === card.id
            return (
              <div key={edge.id} className="flex items-center gap-2 text-[12px] px-2.5 py-1.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(226,232,240,0.7)' }}>
                {outgoing ? <ArrowRight size={12} className="flex-shrink-0 opacity-50" /> : <ArrowLeft size={12} className="flex-shrink-0 opacity-50" />}
                <span className="truncate flex-1">{other ? previewOf(other.data.content) : '(삭제된 카드)'}</span>
                <button onClick={() => onRemoveConnection(edge.id)} className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0">
                  <X size={11} />
                </button>
              </div>
            )
          })}

          {pickerOpen ? (
            <div className="mt-1 rounded-lg max-h-32 overflow-y-auto scrollbar-hide" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              {connectable.length === 0 ? (
                <p className="text-[12px] px-2.5 py-2" style={{ color: 'rgba(226,232,240,0.28)' }}>연결할 다른 카드가 없습니다</p>
              ) : connectable.map(c => (
                <button key={c.id} onClick={() => { onAddConnection(c.id); setPickerOpen(false) }}
                  className="w-full text-left text-[12px] px-2.5 py-1.5 truncate transition-colors hover:bg-white/[0.06]"
                  style={{ color: 'rgba(226,232,240,0.75)' }}>
                  {previewOf(c.data.content)}
                </button>
              ))}
            </div>
          ) : (
            <button onClick={() => setPickerOpen(true)}
              className="mt-1 flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg self-start transition-colors"
              style={{ background: 'rgba(76,127,224,0.14)', border: '1px solid rgba(76,127,224,0.3)', color: '#9DBEF5' }}>
              <Plus size={12} /> 카드 연결
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
