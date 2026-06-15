'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Supabase user_settings 테이블을 통해 PC-모바일 간 설정을 동기화하는 훅.
 * localStorage 대신 사용. 낙관적 업데이트로 UX 지연 없음.
 */
export function useUserSetting<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue)
  const [ready, setReady] = useState(false)
  const supabase = createClient()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase
      .from('user_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value !== undefined && data.value !== null) {
          setValue(data.value as T)
        }
        setReady(true)
      })
  }, [key])

  function save(next: T) {
    setValue(next)
    // debounce: 연속 변경 시 마지막 값만 저장
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      supabase
        .from('user_settings')
        .upsert({ key, value: next, updated_at: new Date().toISOString() })
        .then(() => {})
    }, 400)
  }

  return { value, save, ready }
}
