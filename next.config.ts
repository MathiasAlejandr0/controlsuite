import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  async redirects() {
    return [{ source: '/security', destination: '/incidents', permanent: false }]
  },
}

export default nextConfig
