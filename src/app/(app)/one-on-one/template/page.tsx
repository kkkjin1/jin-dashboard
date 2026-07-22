'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

export default function OneOnOneTemplatePage() {
  const [content, setContent] = useState('')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('one_on_one_template').select('id, content').limit(1).single()
      .then(({ data }) => {
        if (data) {
          setContent((data as { id: string; content: string }).content)
          setTemplateId((data as { id: string; content: string }).id)
        }
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    if (templateId) {
      await supabase.from('one_on_one_template').update({ content }).eq('id', templateId)
    } else {
      const { data } = await supabase.from('one_on_one_template').insert({ content }).select('id').single()
      if (data) setTemplateId((data as { id: string }).id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/one-on-one" className="text-sm text-gray-400 hover:text-gray-600">← 1on1 목록</Link>
          <h1 className="text-xl font-bold text-gray-900">1on1 템플릿</h1>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="text-sm bg-[#E8F0FB] text-[#1B3A6B] border border-[#C5D8F0] px-4 py-2 rounded-lg hover:bg-[#D5E6F7] disabled:opacity-50 transition-colors">
          {saved ? '저장됨!' : saving ? '저장 중...' : '저장'}
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-4">새 1on1 세션 시작 시 '템플릿 적용'을 선택하면 이 내용이 첫 노트로 들어갑니다.</p>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <TiptapEditor
          value={content}
          onChange={setContent}
          minHeight={400}
        />
      </div>
    </div>
  )
}
