import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  compress: true,
  async rewrites() {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_API_URL) {
      // Backend origin e.g. https://my-backend.onrender.com
      const backendOrigin = process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, '');
      return [
        {
          source: '/api/:path*',
          destination: `${backendOrigin}/api/:path*`, // Proxy to Backend API
        },
        {
          source: '/public/:path*',
          destination: `${backendOrigin}/public/:path*`, // Proxy to Backend Static Files (avatars)
        }
      ];
    }
    return [];
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
