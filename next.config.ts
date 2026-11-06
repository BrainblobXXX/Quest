import os from 'node:os';
import type { NextConfig } from 'next';

// dev-сервер открывают и как localhost, и с телефона по адресу машины в сети.
// Без этих origin Next блокирует скрипты HMR, и страница остаётся пустой.
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((info) => info && info.family === 'IPv4' && !info.internal)
  .map((info) => info!.address);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // standalone нужен хостингу: scripts.start запускает .next/standalone/server.js
  output: 'standalone',
  allowedDevOrigins: ['localhost', '127.0.0.1', ...lanAddresses],
  // в dev Next рисует значок в левом нижнем углу — он перекрывает кнопку POWER
  devIndicators: false,
};

export default nextConfig;
