import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    return [
      {
        // JSON игр меняется от сборки к сборке: кэш (браузер, CDN, прокси)
        // не должен отдавать прошлую версию сюжета. Картинки и музыку не трогаем.
        source: '/games/:path*.json',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
