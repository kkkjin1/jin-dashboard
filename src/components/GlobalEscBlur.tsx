'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function GlobalEscBlur() {
  const router = useRouter()
  const escBlurred = useRef(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement
      const isInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement

      if (e.key === 'Escape') {
        if (isInput) (active as HTMLElement).blur()
        escBlurred.current = true
      } else if (e.key === 'Backspace' && escBlurred.current) {
        const nowActive = document.activeElement
        const nowInput =
          nowActive instanceof HTMLInputElement ||
          nowActive instanceof HTMLTextAreaElement ||
          nowActive instanceof HTMLSelectElement
        if (!nowInput) {
          e.preventDefault()
          router.back()
        }
        escBlurred.current = false
      } else {
        escBlurred.current = false
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  return null
}
