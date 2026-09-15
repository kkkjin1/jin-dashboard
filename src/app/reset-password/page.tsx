'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let resolved = false

    function resolve(session: boolean) {
      if (resolved) return
      resolved = true
      setHasSession(session)
      setChecking(false)
    }

    // INITIAL_SESSION: 해시(#access_token=)로 들어온 세션을 클라이언트가 자동 처리할 때 발생
    // PASSWORD_RECOVERY: recovery 타입 세션일 때
    // SIGNED_IN: 그 외 로그인된 상태
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        resolve(!!session)
      } else if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        resolve(!!session)
      }
    })

    // PKCE 방식(?code=)인 경우 직접 교환
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).catch(() => resolve(false))
    }

    // 2초 안에 이벤트 없으면 타임아웃으로 판단
    const timer = setTimeout(() => resolve(false), 2000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return }
    if (password !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError('비밀번호 변경에 실패했습니다: ' + error.message); return }
    setDone(true)
    setTimeout(() => router.push('/'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)' }}>
      <div className="rounded-2xl p-8 w-full max-w-sm"
        style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-[#4C7FE0] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">인</span>
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>비밀번호 재설정</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>인사기획팀 · 업무 보드</p>
          </div>
        </div>

        {checking ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>확인 중…</p>
        ) : !hasSession ? (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              링크가 유효하지 않거나 만료됐습니다. 로그인 화면에서 재설정 메일을 다시 요청해주세요.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
              로그인 화면으로
            </button>
          </div>
        ) : done ? (
          <p className="text-sm text-emerald-600 text-center py-6">비밀번호가 변경됐습니다. 이동 중…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>새 비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] transition-colors placeholder:text-[rgba(var(--text-rgb),0.3)]"
                style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)', color: 'rgba(var(--text-rgb),1)' }}
                placeholder="6자 이상"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>새 비밀번호 확인</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] transition-colors placeholder:text-[rgba(var(--text-rgb),0.3)]"
                style={{ background: 'rgba(var(--ink-rgb),0.06)', border: '1px solid rgba(var(--ink-rgb),0.09)', color: 'rgba(var(--text-rgb),1)' }}
                placeholder="다시 입력"
                required
              />
            </div>

            {error && (
              <p className="text-xs rounded-lg px-3 py-2"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--error-badge-text)' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#4C7FE0] hover:bg-[#3A6CC8] text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 mt-1">
              {loading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
