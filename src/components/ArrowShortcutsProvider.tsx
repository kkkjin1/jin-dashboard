'use client'

import { useEffect } from 'react'
import { installArrowShortcuts } from '@/lib/arrowShortcuts'

export default function ArrowShortcutsProvider() {
  useEffect(() => installArrowShortcuts(), [])
  return null
}
