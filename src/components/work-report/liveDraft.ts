'use client'

import { useEffect, useSyncExternalStore } from 'react'

// ── 입력 중 값 공유(완성본 미리보기용, 2026-11-16) ─────────────────────────
// DB 저장은 1.2초 debounce라 저장된 state만 보면 미리보기가 늦게 따라온다. 편집 칸들이
// 지금 입력 중인 값을 여기에 올리고, 미리보기는 저장된 값 위에 덮어 그린다.
// 키: `report:<work_reports.id>` / `entry:<work_report_entries.id>`. 읽기 전용 표시용일 뿐
// 저장 경로와는 무관하다(새로고침하면 비고, 그때는 저장된 값이 그대로 보인다).

type Drafts = ReadonlyMap<string, Record<string, string>>

let drafts: Drafts = new Map()
const listeners = new Set<() => void>()

function setLiveDraft(key: string, value: Record<string, string>) {
  const prev = drafts.get(key)
  if (prev && Object.keys(value).every(k => prev[k] === value[k])) return
  const next = new Map(drafts)
  next.set(key, { ...prev, ...value })
  drafts = next
  listeners.forEach(l => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

const EMPTY: Drafts = new Map()

export function useLiveDrafts(): Drafts {
  return useSyncExternalStore(subscribe, () => drafts, () => EMPTY)
}

// 편집 칸 쪽 — value가 바뀔 때마다 올린다(null이면 아무것도 안 함).
export function usePublishLiveDraft(key: string | null, value: Record<string, string> | null) {
  const json = value ? JSON.stringify(value) : null
  useEffect(() => {
    if (!key || !json) return
    setLiveDraft(key, JSON.parse(json))
  }, [key, json])
}
