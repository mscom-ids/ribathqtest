import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  compress: true,
  async rewrites() {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL
      || (process.env.NODE_ENV !== 'production' ? 'http://localhost:5000/api' : '');

    if (!apiBaseUrl) return [];

    const backendOrigin = apiBaseUrl.replace(/\/api\/?$/, '');
    return [
      { source: '/api/:path*', destination: `${backendOrigin}/api/:path*` },
      { source: '/public/:path*', destination: `${backendOrigin}/public/:path*` },
    ];
  },
  async headers() {
    if (process.env.NODE_ENV !== 'production') {
      return [];
    }

    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
