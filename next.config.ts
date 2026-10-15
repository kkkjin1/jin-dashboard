import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
