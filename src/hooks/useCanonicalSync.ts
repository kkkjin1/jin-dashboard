'use client'

// Generic canonical-write sync hook — extracted from ReportEditorPanel.tsx (work-report
// Phase: Topic Table View) so the same debounce/dirty-check/retry semantics can be shared
// between the single-topic Writing surface and the multi-row Table surface without either
// one inventing an independent save path for the same work_report_entries/work_reports rows.
//
// 2026-09-14 자동저장/보안 재검증에서 확인된 결함: 기존 코드는 실제 UPDATE가 성공하기도
// 전에 savedRef를 먼저 갱신했고(낙관적 마킹), 실패해도 재시도/에러 표시가 전혀 없었다.
// 이 훅은 그 두 문제를 최소 구조로 고친다: (1) savedRef는 UPDATE가 실제로 성공한 뒤에만
// 갱신, (2) idle/saving/saved/failed 상태를 노출해 실패를 화면에 그대로 보여줌, (3) 실패 시
// 1회 짧은 재시도(기본 1.5s). unmount 시에는 pending debounce를 취소만 하고 흘려보내는 대신
// useAutosave.ts의 "unmount flush (best-effort)" 패턴을 그대로 재사용한다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CanonicalStatus = 'idle' | 'saving' | 'saved' | 'failed'

export function canonicalStatusText(status: CanonicalStatus): string {
  switch (status) {
    case 'saving': return '저장 중…'
    case 'saved': return '저장됨'
    case 'failed': return '저장 실패'
    default: return ''
  }
}

export function useCanonicalSync<T>({
  supabase, table, id, draft, readOnly, onSaved, debounceMs = 1200, retryMs = 1500,
}: {
  supabase: SupabaseClient
  table: string
  id: string | null
  draft: T | null
  readOnly: boolean
  onSaved: (row: unknown) => void
  debounceMs?: number
  retryMs?: number
}): { status: CanonicalStatus; flush: () => Promise<void> } {
  const [status, setStatus] = useState<CanonicalStatus>('idle')
  const savedRef = useRef<T | null>(draft)
  const idRef = useRef(id)
  const draftRef = useRef(draft)
  const readOnlyRef = useRef(readOnly)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => { idRef.current = id }, [id])
  useEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => { readOnlyRef.current = readOnly }, [readOnly])

  const attemptSave = useCallback(async (): Promise<boolean> => {
    const currentId = idRef.current
    const currentDraft = draftRef.current
    if (!currentId || readOnlyRef.current || currentDraft == null) return true
    if (JSON.stringify(currentDraft) === JSON.stringify(savedRef.current)) return true
    if (inFlightRef.current) return false
    inFlightRef.current = true
    setStatus('saving')
    try {
      // `table`은 여러 캐노니컬 테이블에 재사용하는 일반 string이라 supabase-js가
      // 테이블별 정확한 Update row 타입을 추론할 수 없다 — 호출부에서 이미 각 테이블에
      // 맞는 T로 고정해 넘기므로 안전하다.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from(table) as any).update(currentDraft).eq('id', currentId).select().single()
      inFlightRef.current = false
      if (error || !data) {
        setStatus('failed')
        return false
      }
      // 실제로 보낸 draft 값에 대해서만 "저장됨"으로 마킹한다 — 요청이 진행되는
      // 동안 더 최신 입력이 들어왔다면 draftRef.current가 이미 앞서 있으므로,
      // 위 dirty-check가 그 값을 자동으로 다시 저장 대상으로 잡는다.
      savedRef.current = currentDraft
      setStatus('saved')
      onSaved(data)
      return true
    } catch {
      inFlightRef.current = false
      setStatus('failed')
      return false
    }
  }, [supabase, table, onSaved])

  // 입력 변화에 따른 debounce 저장
  useEffect(() => {
    if (readOnly || id == null || draft == null) return
    if (JSON.stringify(draft) === JSON.stringify(savedRef.current)) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void attemptSave().then(ok => {
        if (!ok) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
          retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; void attemptSave() }, retryMs)
        }
      })
    }, debounceMs)
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, readOnly, id, debounceMs, retryMs])

  useEffect(() => {
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current) }
  }, [])

  // unmount flush (best-effort) — useAutosave.ts:483-490과 동일한 패턴.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        void attemptSave()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    await attemptSave()
  }, [attemptSave])

  return { status, flush }
}
