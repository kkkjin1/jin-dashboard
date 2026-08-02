import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/objectives-test', destination: '/objective-review', permanent: true },
      { source: '/completed-test',  destination: '/perf-review',      permanent: true },
    ]
  },
};

export default nextConfig;
