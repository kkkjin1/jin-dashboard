'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import type { OneOnOneTemplate } from '@/types'
import dynamic from 'next/dynamic'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

const T1 = 'rgba(226,232,240,0.92)'
const T2 = 'rgba(226,232,240,0.55)'
const T3 = 'rgba(226,232,240,0.35)'
const BORDER = 'rgba(255,255,255,0.08)'

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function OneOnOneTemplatePage() {
  const supabase = createClient()
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [titleInput, setTitleInput] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const loaded = useRef(false)

  useEffect(() => {
    supabase.from('one_on_one_template').select('*').order('updated_at', { ascending: false })
      .then(({ data }) => { setTemplates((data ?? []) as OneOnOneTemplate[]); setLoading(false) })
  }, [])

  function openTemplate(t: OneOnOneTemplate) {
    clearTimeout(saveTimer.current)
    setEditingId(t.id)
    setTitleInput(t.title)
    setContent(t.content)
    loaded.current = true
  }

  async function createTemplate() {
    const { data, error } = await supabase.from('one_on_one_template')
      .insert({ title: '새 템플릿', content: '' }).select().single()
    if (error || !data) { console.error('템플릿 생성 실패:', error?.message); return }
    const t = data as OneOnOneTemplate
    setTemplates(prev => [t, ...prev])
    loaded.current = false
    setEditingId(t.id)
    setTitleInput(t.title)
    setContent(t.content)
    loaded.current = true
  }

  async function deleteTemplate(id: string, title: string) {
    if (!confirm(`'${title}' 템플릿을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('one_on_one_template').delete().eq('id', id)
    if (error) { alert('템플릿 삭제에 실패했습니다.'); return }
    setTemplates(prev => prev.filter(t => t.id !== id))
    if (editingId === id) setEditingId(null)
  }

  async function persist(id: string, patch: { title?: string; content?: string }) {
    setSaving(true)
    const { error } = await supabase.from('one_on_one_template').update(patch).eq('id', id)
    setSaving(false)
    if (error) { console.error('템플릿 저장 실패:', error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  function handleContentChange(html: string) {
    setContent(html)
    if (!loaded.current || !editingId) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(editingId, { content: html }), 1500)
  }

  function handleTitleBlur() {
    const title = titleInput.trim() || '새 템플릿'
    setTitleInput(title)
    if (editingId) persist(editingId, { title })
  }

  const editing = templates.find(t => t.id === editingId) ?? null

  if (editingId) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setEditingId(null)}
              className="text-sm flex-shrink-0 transition-colors"
              style={{ color: T3 }}
              onMouseEnter={e => (e.currentTarget.style.color = T2)}
              onMouseLeave={e => (e.currentTarget.style.color = T3)}>
              ← 템플릿 목록
            </button>
            <input
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="템플릿 이름"
              className="text-xl font-bold bg-transparent focus:outline-none min-w-0"
              style={{ color: T1 }}
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs" style={{ color: T3 }}>{saved ? '저장됨!' : saving ? '저장 중...' : ''}</span>
            <button onClick={() => editing && deleteTemplate(editing.id, editing.title)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: T3 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={e => (e.currentTarget.style.color = T3)}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <p className="text-xs mb-4" style={{ color: T3 }}>
          이 템플릿을 적용해 새 1on1을 시작하면 이 내용이 첫 노트로 들어갑니다.
        </p>

        <div className="surface-card rounded-2xl overflow-hidden px-4 py-3">
          <TiptapEditor
            dark
            value={content}
            onChange={handleContentChange}
            minHeight={400}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Link href="/one-on-one" className="text-sm transition-colors"
            style={{ color: T3 }}
            onMouseEnter={e => (e.currentTarget.style.color = T2)}
            onMouseLeave={e => (e.currentTarget.style.color = T3)}>
            ← 1on1 목록
          </Link>
          <h1 className="text-xl font-bold" style={{ color: T1 }}>1on1 템플릿</h1>
        </div>
        <button onClick={createTemplate}
          className="text-sm px-4 py-2 rounded-lg transition-colors"
          style={{ background: 'rgba(76,127,224,0.1)', color: '#9DBEF5', border: '1px solid rgba(76,127,224,0.25)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(76,127,224,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(76,127,224,0.1)')}>
          + 새 템플릿
        </button>
      </div>

      <p className="text-xs mb-5" style={{ color: T3 }}>
        상황별로 템플릿을 여러 개 만들어두고, 새 1on1을 시작할 때 골라 쓸 수 있습니다.
      </p>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <p className="text-sm" style={{ color: T3 }}>아직 템플릿이 없습니다</p>
          <button onClick={createTemplate}
            className="text-xs px-4 py-1.5 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, color: T2 }}>
            첫 템플릿 만들기
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map(t => (
            <div key={t.id}
              onClick={() => openTemplate(t)}
              className="group relative rounded-xl px-4 py-3 cursor-pointer transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}` }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}>
              <p className="text-sm font-semibold truncate pr-6" style={{ color: T1 }}>{t.title}</p>
              <p className="text-xs mt-1 truncate" style={{ color: T3 }}>
                {format(parseISO(t.updated_at), 'yy.M.d', { locale: ko })} · {stripHtml(t.content).slice(0, 50) || '내용 없음'}
              </p>
              <button
                onClick={e => { e.stopPropagation(); deleteTemplate(t.id, t.title) }}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: T3 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                onMouseLeave={e => (e.currentTarget.style.color = T3)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
