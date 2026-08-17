import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/__copypatch/api/:path*',
        destination: 'http://localhost:4040/__copypatch/api/:path*',
      },
    ];
  },
};

export default nextConfig;
