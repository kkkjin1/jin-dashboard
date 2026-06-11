'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { MemoTag } from '@/types'
import SmartTextarea from '@/components/SmartTextarea'

const TAGS: MemoTag[] = ['업무관련', '회의관련', '아이디어', '공지']

const TAG_COLORS: Record<MemoTag, string> = {
  '업무관련': 'bg-blue-50 text-blue-600 border-blue-200',
  '회의관련': 'bg-purple-50 text-purple-600 border-purple-200',
  '아이디어': 'bg-amber-50 text-amber-600 border-amber-200',
  '공지': 'bg-red-50 text-red-600 border-red-200',
}

export default function QuickMemoPanel() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MemoTag>('업무관련')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (open) setTimeout(() => titleRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) { setOpen(false); return }
      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault()
        setOpen(prev => !prev)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        const { data } = await supabase
          .from('tasks')
          .insert({ title: '', part: '코어', type: '기획', status: '진행필요' })
          .select('id')
          .single()
        if (data) router.push(`/tasks/${(data as { id: string }).id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, router])

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await supabase.from('quick_memos').insert({ title: title.trim(), content: content.trim(), tag })
    setTitle(''); setContent(''); setTag('업무관련')
    setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); setOpen(false) }, 1000)
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <div className={`fixed bottom-0 right-6 z-50 w-96 bg-white rounded-t-2xl shadow-2xl border border-gray-200 transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">빠른 메모</h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>

          <div className="flex gap-1.5 mb-3">
            {TAGS.map(t => (
              <button key={t} onClick={() => setTag(t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${tag === t ? TAG_COLORS[t] : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>
                {t}
              </button>
            ))}
          </div>

          <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="제목 (엔터로 저장)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 mb-2" />

          <SmartTextarea value={content} onChange={setContent}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave() }}
            placeholder="내용 (선택, Ctrl+Enter 저장)"
            rows={4}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 resize-none" />

          <div className="flex justify-between items-center mt-3">
            <span className="text-xs text-gray-300">ESC · Ctrl+2 메모 · Ctrl+1 업무추가</span>
            <button onClick={handleSave} disabled={!title.trim() || saving}
              className="text-xs bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-30 transition-colors">
              {saved ? '저장됨!' : saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>

      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-gray-800 text-white rounded-full shadow-lg hover:bg-gray-700 transition-all hover:scale-110 flex items-center justify-center text-xl font-light"
          title="빠른 메모 (Ctrl+2)">
          +
        </button>
      )}
    </>
  )
}
