'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type AgendaMemoStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed'

// 테스트실무 상세 패널의 메모 — annual_goal_tasks.notes(엑셀 원본 "비고", /annual-goals
// 상세에서 읽기 전용으로 표시됨)는 건드리지 않는다. 대신 이미 자유 메모 목적으로 쓰이는
// annual_goal_task_notes(해당 화면의 "진행 기록")를 재사용하되, 가장 오래된 한 건만
// 단일 메모 박스처럼 다룬다. 새 메모 테이블은 만들지 않는다.
export function useAgendaMemo(agendaId: string | null) {
  const supabase = createClient()
  const [noteId, setNoteId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<AgendaMemoStatus>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (!agendaId) { setNoteId(null); setContent(''); setReady(false); return }
    setReady(false)
    setStatus('idle')
    const { data } = await supabase
      .from('annual_goal_task_notes')
      .select('id, content')
      .eq('task_id', agendaId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    setNoteId(data?.id ?? null)
    setContent(data?.content ?? '')
    setReady(true)
  }, [agendaId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // 저장 안 된 변경사항(pending/saving/failed)이 있을 때만 새로고침/탭 종료를 경고
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (status === 'pending' || status === 'saving' || status === 'failed') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [status])

  function change(value: string) {
    setContent(value)
    if (!agendaId) return
    setStatus('pending')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (statusResetTimer.current) clearTimeout(statusResetTimer.current)
    saveTimer.current = setTimeout(async () => {
      setStatus('saving')
      if (noteId) {
        const { error } = await supabase.from('annual_goal_task_notes').update({ content: value, edited_at: new Date().toISOString() }).eq('id', noteId)
        if (error) { console.error('[테스트실무] 메모 저장 실패:', error.message); setStatus('failed'); return }
      } else {
        const { data, error } = await supabase.from('annual_goal_task_notes')
          .insert({ task_id: agendaId, title: null, content: value })
          .select('id').single()
        if (error || !data) { console.error('[테스트실무] 메모 저장 실패:', error?.message ?? 'unknown'); setStatus('failed'); return }
        setNoteId(data.id)
      }
      setStatus('saved')
      statusResetTimer.current = setTimeout(() => setStatus('idle'), 2000)
    }, 600)
  }

  return { content, change, ready, status }
}
