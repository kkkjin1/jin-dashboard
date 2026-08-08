'use client'

import { useParams } from 'next/navigation'
import SketchCanvas from '@/components/sketch/SketchCanvas'

export default function SketchBoardPage() {
  const { id } = useParams<{ id: string }>()
  return <SketchCanvas boardId={id} />
}
