'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } else {
      router.push('/')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7F5]">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 w-full max-w-sm">

        {/* 브랜드 헤더 */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-[#1B3A6B] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">인</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">인사기획 워크</p>
            <p className="text-xs text-gray-400">인사기획팀 · 업무 보드</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {/* 이메일 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 focus:border-[#1B3A6B] bg-white placeholder-gray-300 transition-colors"
              placeholder="name@company.com"
              required
            />
          </div>

          {/* 비밀번호 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-gray-500">비밀번호</label>
              <button type="button" className="text-[11px] text-gray-400 hover:text-[#1B3A6B] transition-colors">
                비밀번호를 잊으셨나요?
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 focus:border-[#1B3A6B] bg-white placeholder-gray-300 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1B3A6B] hover:bg-[#1F4070] text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 mt-1"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        {/* 하단 헬퍼 */}
        <p className="text-center text-xs text-gray-400 mt-6">
          아직 계정이 없으신가요?{' '}
          <button type="button" className="text-[#1B3A6B] font-medium hover:underline">
            가입하기
          </button>
        </p>
      </div>
    </div>
  )
}
