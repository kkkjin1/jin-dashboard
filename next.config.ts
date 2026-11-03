import type { NextConfig } from "next";

// 보안 헤더 (외부 공격 대비). 기능을 깨지 않는 항목만 — 스크립트 제한(엄격 CSP)은 Tiptap·Supabase 실시간과 충돌 위험이 커서 제외.
// - 다른 사이트가 이 앱을 iframe으로 감싸 클릭을 유도하는 것 차단 (같은 사이트 iframe은 허용)
// - 파일 형식 위장 실행 차단, 외부로 나가는 주소 정보 최소화, 카메라·마이크·위치 사용 차단, HTTPS 강제
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
  // 같은 Wi-Fi 휴대폰에서 로컬 dev 서버 확인용 (dev 전용, 배포에는 영향 없음)
  allowedDevOrigins: ['192.168.*.*'],
  async redirects() {
    return [
      { source: '/objectives-test', destination: '/objective-review', permanent: true },
      { source: '/completed-test',  destination: '/perf-review',      permanent: true },
    ]
  },
};

export default nextConfig;
