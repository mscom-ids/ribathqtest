import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  compress: true,
  async rewrites() {
    const apiBaseUrl = (
      process.env.BACKEND_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://127.0.0.1:5000/api'
    ).trim();
    const backendOrigin = apiBaseUrl
      .replace(/\/+$/, '')
      .replace(/\/api$/, '');

    return {
      beforeFiles: [
        {
          source: '/api/parent/:path*',
          destination: '/parent-api-proxy/:path*',
        },
      ],
      afterFiles: [
        { source: '/api/:path*', destination: `${backendOrigin}/api/:path*` },
        { source: '/public/:path*', destination: `${backendOrigin}/public/:path*` },
      ],
    };
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
