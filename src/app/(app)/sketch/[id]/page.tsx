'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SketchCanvas from '@/components/sketch/SketchCanvas'
import FreeNoteCanvas from '@/components/sketch/FreeNoteCanvas'
import type { SketchBoard } from '@/types'

const LOADING_TEXT_STYLE = { color: 'rgba(226,232,240,0.35)' }

export default function SketchBoardPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()
  const [boardType, setBoardType] = useState<SketchBoard['board_type'] | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    // board_type 하나만 select하면 supabase/schema_v53.sql 적용 전(컬럼 없음)
    // 조회 자체가 에러로 실패해 기존 마인드맵 보드까지 "찾을 수 없음"으로
    // 보이게 된다 — '*'로 받아 없으면 기본값(mindmap)으로 취급해 하위호환한다.
    supabase.from('sketch_boards').select('*').eq('id', id).single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); return }
        setBoardType((data.board_type as SketchBoard['board_type'] | undefined) ?? 'mindmap')
      })
  }, [id])

  if (notFound) {
    return <div className="h-full flex items-center justify-center text-[13px]" style={LOADING_TEXT_STYLE}>보드를 찾을 수 없습니다</div>
  }
  if (!boardType) {
    return <div className="h-full flex items-center justify-center text-[13px]" style={LOADING_TEXT_STYLE}>불러오는 중…</div>
  }

  return boardType === 'freenote' ? <FreeNoteCanvas boardId={id} /> : <SketchCanvas boardId={id} />
}
