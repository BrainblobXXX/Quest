import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // standalone нужен хостингу: scripts.start запускает .next/standalone/server.js
  output: 'standalone',
};

export default nextConfig;
