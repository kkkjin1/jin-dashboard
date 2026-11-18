'use client'

// 저장된 메모를 별도 팝업창으로 여는 화면 — 메모탭 상세의 '⧉ 팝업' 버튼이 연다.
// Ctrl+3 빠른 메모 창처럼 작은 창으로 뜨고, 메모탭과 같은 상세 패널을 그대로 쓴다.
// 저장·삭제하면 memoSync 알림으로 메모탭(다른 창)의 목록·열린 패널이 바로 갱신된다.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clearAutosaveBuffer } from '@/hooks/useAutosave'
import { useUserSetting } from '@/hooks/useUserSetting'
import { useTheme } from '@/lib/theme'
import { broadcastMemo, subscribeMemoSync } from '@/lib/memoSync'
import MemoDetailPanel from '@/components/memo/MemoDetailPanel'
import type { QuickMemo, MemoTag } from '@/types'

const DEFAULT_CATEGORIES: MemoTag[] = ['공지', '업무관련', '회의관련', '아이디어', '완료']

export default function MemoViewPopup() {
  const supabase = createClient()
  const [theme] = useTheme()
  const { value: categories } = useUserSetting<MemoTag[]>('memo_categories', DEFAULT_CATEGORIES)
  const [memo, setMemo] = useState<QuickMemo | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing' | 'deleted'>('loading')

  useEffect(() => {
    // id가 없으면 조회 결과가 비어 '찾을 수 없음'으로 끝난다(따로 분기하지 않음)
    const id = new URLSearchParams(window.location.search).get('id') ?? ''
    supabase.from('quick_memos').select('*').eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (!data) { setStatus('missing'); return }
        setMemo(data as QuickMemo)
        setStatus('ok')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.title = memo ? `메모 · ${memo.title}` : '메모'
  }, [memo])

  // 메모탭 등 다른 창에서 이 메모를 지우면 이 창은 안내만 남긴다
  useEffect(() => subscribeMemoSync(msg => {
    if (msg.type === 'deleted' && memo && msg.id === memo.id) setStatus('deleted')
  }), [memo])

  async function save(id: string, title: string, content: string, tags: MemoTag[]) {
    if (!title.trim()) return
    await supabase.from('quick_memos').update({ title: title.trim(), content: content.trim(), tag: tags }).eq('id', id)
    setMemo(prev => (prev ? { ...prev, title: title.trim(), content: content.trim(), tag: tags } : prev))
    broadcastMemo({ type: 'updated', memo: { id, title: title.trim(), content: content.trim(), tag: tags } })
  }

  async function remove(id: string): Promise<boolean> {
    if (!confirm('메모를 삭제하시겠습니까?')) return false
    await supabase.from('quick_memos').delete().eq('id', id)
    await supabase.from('autosave_drafts').delete().eq('entity_type', 'quick_memo').eq('entity_id', id)
    clearAutosaveBuffer('quick_memo', id, 'draft')
    broadcastMemo({ type: 'deleted', id })
    return true
  }

  return (
    <div className="h-screen flex flex-col p-3" style={{ background: 'var(--surface-primary)', colorScheme: theme, boxSizing: 'border-box' }}>
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)' }}>
        {status === 'ok' && memo ? (
          <MemoDetailPanel memo={memo} categories={categories} onSave={save} onAutoSave={save} onDelete={remove} onClose={() => window.close()} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-[rgba(var(--text-rgb),0.35)] text-sm">
              {status === 'loading' ? '불러오는 중…' : status === 'deleted' ? '다른 창에서 삭제된 메모입니다' : '메모를 찾을 수 없습니다'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
