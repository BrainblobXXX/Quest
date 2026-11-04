import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // standalone нужен хостингу: scripts.start запускает .next/standalone/server.js
  output: 'standalone',
  // dev-сервер открывают и как localhost, и как 127.0.0.1: без этого Next
  // блокирует HMR для «чужого» origin и страница остаётся пустой
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  // в dev Next рисует значок в левом нижнем углу — он перекрывает кнопку POWER
  devIndicators: false,
};

export default nextConfig;
