// 1회성 스크립트: Google Calendar refresh token 발급
// 사용법:
//   1) .env.local 에 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 를 먼저 채워넣는다
//   2) node scripts/google-calendar-token.mjs 실행
//   3) 출력된 URL을 브라우저에서 열어 본인 구글 계정으로 로그인/동의
//   4) 터미널에 refresh_token이 출력되면 .env.local의 GOOGLE_REFRESH_TOKEN에 붙여넣는다
//
// 새 npm 패키지를 추가하지 않기 위해 Node 내장 http + fetch만 사용한다.

import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')

function loadEnvLocal() {
  try {
    const text = readFileSync(envPath, 'utf-8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch {}
}
loadEnvLocal()

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const PORT = 53682
const REDIRECT_URI = `http://localhost:${PORT}/callback`

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 가 .env.local에 없습니다. 먼저 채워주세요.')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', CLIENT_ID)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.readonly')
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')

console.log('\n아래 URL을 브라우저에서 열어 로그인/동의해주세요:\n')
console.log(authUrl.toString())
console.log(`\n(로컬 ${PORT} 포트에서 콜백을 기다리는 중...)\n`)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname !== '/callback') { res.end('ok'); return }

  const code = url.searchParams.get('code')
  if (!code) {
    res.end('code가 없습니다. 다시 시도해주세요.')
    return
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })
    const data = await tokenRes.json()
    if (!data.refresh_token) {
      console.error('\nrefresh_token이 응답에 없습니다. (이미 한 번 동의한 계정이면 Google 계정 설정에서 앱 연결을 해제 후 다시 시도하세요)')
      console.error(data)
      res.end('refresh_token 발급 실패 — 터미널을 확인하세요.')
    } else {
      console.log('\n✅ 아래 값을 .env.local의 GOOGLE_REFRESH_TOKEN 에 붙여넣으세요:\n')
      console.log(data.refresh_token)
      console.log('')
      res.end('완료! 터미널로 돌아가서 refresh_token을 .env.local에 붙여넣으세요. 이 창은 닫아도 됩니다.')
    }
  } catch (err) {
    console.error(err)
    res.end('오류가 발생했습니다. 터미널을 확인하세요.')
  } finally {
    setTimeout(() => { server.close(); process.exit(0) }, 500)
  }
})

server.listen(PORT)
