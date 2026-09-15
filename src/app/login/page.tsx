'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
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

  async function handleForgotPassword() {
    if (!email.trim()) { setError('비밀번호를 재설정하려면 이메일을 먼저 입력해주세요.'); return }
    setError('')
    setResetLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) { setError('재설정 메일 발송에 실패했습니다: ' + error.message); return }
    setResetSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)' }}>
      <div className="rounded-2xl p-8 w-full max-w-sm"
        style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>

        {/* 브랜드 헤더 */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-[#4C7FE0] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">인</span>
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>인사기획 워크</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>인사기획팀 · 업무 보드</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {/* 이메일 */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] transition-colors placeholder:text-[rgba(var(--text-rgb),0.3)]"
              style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)', color: 'rgba(var(--text-rgb),1)' }}
              placeholder="name@company.com"
              required
            />
          </div>

          {/* 비밀번호 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>비밀번호</label>
              <button type="button" onClick={handleForgotPassword} disabled={resetLoading}
                className="text-[11px] hover:text-[#4C7FE0] transition-colors disabled:opacity-50" style={{ color: 'var(--text-muted)' }}>
                {resetLoading ? '전송 중...' : '비밀번호를 잊으셨나요?'}
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] transition-colors placeholder:text-[rgba(var(--text-rgb),0.3)]"
              style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)', color: 'rgba(var(--text-rgb),1)' }}
              placeholder="••••••••"
            />
          </div>

          {resetSent && (
            <p className="text-xs rounded-lg px-3 py-2"
              style={{ background: 'rgba(76,127,224,0.12)', border: '1px solid rgba(76,127,224,0.3)', color: 'var(--accent-badge-text)' }}>재설정 메일을 보냈습니다. 받은편지함을 확인해주세요.</p>
          )}
          {error && (
            <p className="text-xs rounded-lg px-3 py-2"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--error-badge-text)' }}>{error}</p>
          )}

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 mt-1"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

      </div>
    </div>
  )
}
