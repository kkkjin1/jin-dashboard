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

    // onAuthStateChange가 PASSWORD_RECOVERY 이벤트를 감지하면 세션 확정
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasSession(true)
        setChecking(false)
      }
    })

    // PKCE 방식(?code=)과 기존 세션 둘 다 처리
    async function init() {
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setChecking(false)
          return
        }
        // exchangeCodeForSession 성공 시 onAuthStateChange가 처리함
        return
      }
      // code 없으면 기존 세션 확인 (이미 로그인된 경우)
      const { data: { session } } = await supabase.auth.getSession()
      setHasSession(!!session)
      setChecking(false)
    }
    init()

    return () => subscription.unsubscribe()
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
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7F5]">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 w-full max-w-sm">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-[#4C7FE0] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">인</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">비밀번호 재설정</p>
            <p className="text-xs text-gray-400">인사기획팀 · 업무 보드</p>
          </div>
        </div>

        {checking ? (
          <p className="text-sm text-gray-400 text-center py-6">확인 중…</p>
        ) : !hasSession ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
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
              <label className="block text-xs font-medium text-gray-500 mb-1.5">새 비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] bg-white placeholder-gray-300 transition-colors"
                placeholder="6자 이상"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">새 비밀번호 확인</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4C7FE0]/30 focus:border-[#4C7FE0] bg-white placeholder-gray-300 transition-colors"
                placeholder="다시 입력"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
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
