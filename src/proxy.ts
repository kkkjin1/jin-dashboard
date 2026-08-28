import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims()는 프로젝트가 비대칭 서명키(ES256/RS256)를 쓸 때 JWKS를 캐시해
  // WebCrypto로 JWT 서명을 로컬 검증한다 (Auth 서버 왕복 없음). 서명이 없거나
  // 대칭키(HS256)인 경우에만 내부적으로 getUser()로 폴백해 서버 검증한다.
  // getUser()를 getSession()으로 단순 대체하는 것과 달리, 위조/만료된 토큰은
  // 여전히 암호학적으로 거부된다.
  const { data: claimsData } = await supabase.auth.getClaims()
  const user = claimsData?.claims ?? null
  const isLoginPage = request.nextUrl.pathname === '/login'
  // 비밀번호 재설정 링크는 access_token/code가 URL에 있어야 클라이언트에서 세션을 만들 수 있는데,
  // 그 처리는 브라우저에서만 일어나서 이 미들웨어(서버) 시점엔 아직 세션이 없다.
  // 그래서 이 경로는 로그인 여부와 무관하게 항상 통과시켜야 함.
  const isResetPasswordPage = request.nextUrl.pathname === '/reset-password'

  if (!user && !isLoginPage && !isResetPasswordPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
